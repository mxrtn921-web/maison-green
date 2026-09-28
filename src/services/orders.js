// Commandes : création (transactionnelle), statuts, livreurs, espèces, annulation.
import crypto from 'node:crypto';
import { one, all, run, tx, nowIso } from '../db.js';
import { validate, v } from '../lib/validate.js';
import { HttpError } from '../lib/http.js';
import { publish } from '../lib/events.js';
import { money } from '../lib/html.js';
import { dayLabel, hLabel } from '../lib/time.js';
import { quoteCart } from './catalog.js';
import { zoneForPostal, deliveryFee, findSlot, orderingState } from './delivery.js';
import { notify, sendEmail, orderEmail } from './notify.js';
import { refundPayment } from './payments.js';

export const STATUS = {
  awaiting_payment: { label: 'En attente de paiement', short: 'Paiement' },
  received: { label: 'Commande reçue', short: 'Reçue' },
  confirmed: { label: 'Commande confirmée', short: 'Confirmée' },
  preparing: { label: 'En préparation', short: 'Préparation' },
  ready: { label: 'Prête', short: 'Prête' },
  assigned: { label: 'Livreur assigné', short: 'Livreur assigné' },
  out_for_delivery: { label: 'En livraison', short: 'En livraison' },
  delivered: { label: 'Livrée', short: 'Livrée' },
  cancelled: { label: 'Annulée', short: 'Annulée' },
};
export const FLOW = ['received', 'confirmed', 'preparing', 'ready', 'assigned', 'out_for_delivery', 'delivered'];
export const ACTIVE = ['received', 'confirmed', 'preparing', 'ready', 'assigned', 'out_for_delivery'];

export const PAYMENT_STATUS = {
  pending: 'En attente', paid: 'Payée', failed: 'Échec du paiement', due_on_delivery: 'À encaisser à la livraison',
  refunded: 'Remboursée', partially_refunded: 'Partiellement remboursée', cancelled: 'Annulé',
};

export const slotLabel = (o) => `${dayLabel(o.slot_date).toLowerCase()}, ${hLabel(o.slot_start)} – ${hLabel(o.slot_end)}`;

export const getOrder = (id) => one(`SELECT o.*, d.first_name AS driver_first_name, d.last_name AS driver_last_name, d.phone AS driver_phone
                                     FROM orders o LEFT JOIN users d ON d.id = o.driver_id WHERE o.id = ?`, id);
export const getOrderByToken = (token) => {
  const o = one('SELECT id FROM orders WHERE tracking_token = ?', String(token || '').slice(0, 64));
  return o ? getOrder(o.id) : null;
};
export const orderItems = (orderId) => all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', orderId);
export const orderEvents = (orderId) => all(`SELECT e.*, u.first_name AS actor_name FROM order_events e LEFT JOIN users u ON u.id = e.actor_id
                                             WHERE e.order_id = ? ORDER BY e.id`, orderId);

function addEvent(orderId, status, label, actorId = null) {
  run('INSERT INTO order_events (order_id, status, label, actor_id) VALUES (?, ?, ?, ?)', orderId, status, label || STATUS[status]?.label || status, actorId);
}

function broadcast(order, extra = {}) {
  const data = { id: order.id, number: order.number, status: order.status, ...extra };
  publish('admin', 'order', data);
  publish(`order:${order.tracking_token}`, 'status', { status: order.status });
  if (order.driver_id) publish(`user:${order.driver_id}`, 'order', data);
  publish('driver', 'order', data);
}

// ——— Création ———————————————————————————————————————————————

const checkoutSchema = {
  first_name: v.text({ label: 'Le prénom', max: 60 }),
  last_name: v.text({ label: 'Le nom', max: 60 }),
  email: v.email(),
  phone: v.phone(),
  address_line1: v.text({ label: "L'adresse", min: 4, max: 160 }),
  address_line2: v.text({ label: "Le complément d'adresse", required: false, max: 160 }),
  postal_code: v.postal(),
  city: v.text({ label: 'La ville', max: 80 }),
  instructions: v.longText({ label: 'Les instructions', max: 300 }),
  slot: v.text({ label: 'Le créneau', max: 20 }),
  payment_method: v.oneOf(['card', 'cash'], 'Choisissez un mode de paiement.'),
  accept_terms: v.bool(),
  save_address: v.bool(),
};

/**
 * Crée une commande. Tout est revérifié ici : prix, stock, zone, minimum, créneau.
 * Renvoie { order } ou lève une HttpError(422) avec des messages par champ.
 */
export function createOrder(input, user) {
  const { data, errors } = validate(checkoutSchema, input);
  if (!data.accept_terms) errors.accept_terms = 'Merci d’accepter les conditions générales de vente.';
  if (data.payment_method === 'cash' && !input.allow_cash_ok) { /* toujours autorisé ; hook pour limiter plus tard */ }

  const state = orderingState();
  if (!state.accepting) throw new HttpError(422, state.message || 'Les commandes sont fermées.', { errors });

  const quote = quoteCart(input.items);
  if (!quote.lines.length) throw new HttpError(422, 'Votre panier est vide.', { errors });
  if (quote.issues.length) errors.cart = quote.issues.map((i) => i.message).join(' ');

  const zone = zoneForPostal(data.postal_code);
  if (!errors.postal_code && !zone) errors.postal_code = 'Nous ne livrons pas encore ce code postal. Consultez nos zones de livraison.';
  if (zone && quote.subtotal < zone.min_order_cents) {
    errors.cart = `Le minimum de commande pour ${zone.name} est de ${money(zone.min_order_cents)} (il manque ${money(zone.min_order_cents - quote.subtotal)}).`;
  }

  const [slotDate, slotStart] = String(data.slot || '').split('|');
  const slot = slotDate && slotStart ? findSlot(slotDate, slotStart) : null;
  if (!slot) errors.slot = 'Ce créneau n’est plus disponible, merci d’en choisir un autre.';

  if (Object.keys(errors).length) throw new HttpError(422, 'Certaines informations sont à corriger.', { errors, data });

  const fee = deliveryFee(zone, quote.subtotal);
  const total = quote.subtotal + fee;
  const isCash = data.payment_method === 'cash';
  const token = crypto.randomBytes(18).toString('base64url');

  const order = tx(() => {
    // Réservation du stock : échoue proprement si un autre client vient de prendre le dernier article.
    for (const l of quote.lines) {
      const r = run('UPDATE products SET stock = stock - ?, updated_at = ? WHERE id = ? AND stock >= ?', l.quantity, nowIso(), l.id, l.quantity);
      if (r.changes !== 1) throw new HttpError(409, `${l.name} vient d'être victime de son succès : le stock a changé. Merci de vérifier votre panier.`);
    }
    const r = run(`INSERT INTO orders (number, tracking_token, user_id, status, first_name, last_name, email, phone, address_line1, address_line2,
                     postal_code, city, instructions, zone_id, zone_name, slot_date, slot_start, slot_end, subtotal_cents, delivery_fee_cents,
                     total_cents, payment_method, payment_status, cash_to_collect_cents)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      `TMP-${token}`, token, user?.id ?? null, isCash ? 'received' : 'awaiting_payment', data.first_name, data.last_name, data.email, data.phone,
      data.address_line1, data.address_line2, data.postal_code, data.city, data.instructions, zone.id, zone.name, slot.date, slot.start, slot.end,
      quote.subtotal, fee, total, data.payment_method, isCash ? 'due_on_delivery' : 'pending', isCash ? total : 0);
    const id = Number(r.lastInsertRowid);
    run('UPDATE orders SET number = ? WHERE id = ?', `MG-${1000 + id}`, id);
    for (const l of quote.lines) {
      run('INSERT INTO order_items (order_id, product_id, name, unit, unit_price_cents, quantity, line_total_cents) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, l.id, l.name, l.unit, l.unit_price_cents, l.quantity, l.line_total_cents);
    }
    if (isCash) {
      run("INSERT INTO payments (order_id, provider, status, amount_cents) VALUES (?, 'cash', 'due_on_delivery', ?)", id, total);
      addEvent(id, 'received', 'Commande reçue — paiement en espèces à la livraison');
    } else {
      addEvent(id, 'awaiting_payment', 'En attente du paiement par carte');
    }
    if (user && data.save_address) {
      const exists = one('SELECT id FROM addresses WHERE user_id = ? AND line1 = ? AND postal_code = ?', user.id, data.address_line1, data.postal_code);
      if (!exists) {
        const hasDefault = one('SELECT 1 AS x FROM addresses WHERE user_id = ? AND is_default = 1', user.id);
        run('INSERT INTO addresses (user_id, label, line1, line2, postal_code, city, instructions, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          user.id, 'Domicile', data.address_line1, data.address_line2, data.postal_code, data.city, data.instructions, hasDefault ? 0 : 1);
      }
    }
    if (user && !user.phone) run('UPDATE users SET phone = ? WHERE id = ?', data.phone, user.id);
    return getOrder(id);
  });

  if (isCash) onOrderPlaced(order);
  return { order, items: orderItems(order.id) };
}

/** Commande validée (espèces, ou carte payée) : confirmée automatiquement, les livreurs sont alertés
 *  tout de suite (ils acceptent ou refusent), et on prévient la boutique et le client. */
function onOrderPlaced(order) {
  const items = orderItems(order.id);
  const confirmed = tx(() => {
    const r = run("UPDATE orders SET status = 'confirmed', updated_at = ? WHERE id = ? AND status = 'received'", nowIso(), order.id);
    if (r.changes === 1) addEvent(order.id, 'confirmed', 'Commande confirmée automatiquement — en attente d’un livreur');
    return getOrder(order.id);
  }) || order;
  notify({ audience: 'admin', kind: 'order_new', title: `Nouvelle commande ${confirmed.number}`,
    body: `${confirmed.first_name} ${confirmed.last_name} · ${money(confirmed.total_cents)} · ${confirmed.payment_method === 'cash' ? 'Espèces' : 'Carte'} · ${slotLabel(confirmed)} · envoyée aux livreurs`,
    orderId: confirmed.id, link: `/admin/commandes/${confirmed.id}` });
  if (confirmed.status === 'confirmed' && !confirmed.driver_id) {
    notify({ audience: 'driver', kind: 'delivery_available', title: `Nouvelle course ${confirmed.number}`,
      body: `${slotLabel(confirmed)} · ${confirmed.postal_code} ${confirmed.city}${confirmed.payment_method === 'cash' ? ` · ${money(confirmed.total_cents)} à encaisser` : ''} — Accepter ou refuser ?`,
      orderId: confirmed.id, link: `/livreur/courses/${confirmed.id}` });
  }
  broadcast(confirmed, { isNew: true });
  const o = { ...confirmed, slot_label: slotLabel(confirmed) };
  sendEmail(confirmed.email, orderEmail(o, items, 'confirmation'));
  const shopEmail = one("SELECT value FROM settings WHERE key = 'shop_email'");
  if (shopEmail) sendEmail(JSON.parse(shopEmail.value), orderEmail(o, items, 'admin_new'));
}

// ——— Paiement ———————————————————————————————————————————————

export function markPaid(orderId, { provider, sessionId = null, paymentIntent = null } = {}) {
  const changed = tx(() => {
    const o = getOrder(orderId);
    if (!o || o.payment_status === 'paid' || o.payment_method !== 'card') return null;
    if (o.status === 'cancelled') {
      // Paiement arrivé après expiration : on le signale, l'admin remboursera.
      run("UPDATE orders SET payment_status = 'paid', updated_at = ? WHERE id = ?", nowIso(), orderId);
      notify({ audience: 'admin', kind: 'payment_late', title: `Paiement reçu sur une commande annulée (${o.number})`, body: 'Pensez à rembourser le client.', orderId, link: `/admin/commandes/${orderId}` });
      return null;
    }
    run("UPDATE orders SET status = 'received', payment_status = 'paid', updated_at = ? WHERE id = ?", nowIso(), orderId);
    run(`UPDATE payments SET status = 'paid', payment_intent_id = COALESCE(?, payment_intent_id), updated_at = ?
         WHERE order_id = ? AND (checkout_session_id = ? OR ? IS NULL OR provider = 'demo')`, paymentIntent, nowIso(), orderId, sessionId, sessionId);
    addEvent(orderId, 'received', `Paiement par carte confirmé${provider === 'demo' ? ' (mode démo)' : ''}`);
    return getOrder(orderId);
  });
  if (changed) onOrderPlaced(changed);
  return changed;
}

export function markPaymentFailed(orderId, message = 'Paiement refusé') {
  const o = getOrder(orderId);
  if (!o || o.payment_status === 'paid') return;
  run("UPDATE orders SET payment_status = 'failed', updated_at = ? WHERE id = ?", nowIso(), orderId);
  run("UPDATE payments SET status = 'failed', failure_message = ?, updated_at = ? WHERE order_id = ? AND status = 'pending'", message, nowIso(), orderId);
  addEvent(orderId, 'awaiting_payment', `Échec du paiement : ${message}`);
  publish(`order:${o.tracking_token}`, 'status', { status: o.status });
}

/** Le client abandonne la carte et choisit les espèces (commande encore en attente de paiement). */
export function switchToCash(orderId) {
  const o = getOrder(orderId);
  if (!o || o.status !== 'awaiting_payment') throw new HttpError(409, 'Cette commande ne peut plus changer de mode de paiement.');
  const updated = tx(() => {
    run("UPDATE orders SET payment_method = 'cash', payment_status = 'due_on_delivery', cash_to_collect_cents = total_cents, status = 'received', updated_at = ? WHERE id = ?", nowIso(), orderId);
    run("UPDATE payments SET status = 'cancelled', updated_at = ? WHERE order_id = ? AND status IN ('pending','failed')", nowIso(), orderId);
    run("INSERT INTO payments (order_id, provider, status, amount_cents) VALUES (?, 'cash', 'due_on_delivery', ?)", orderId, o.total_cents);
    addEvent(orderId, 'received', 'Commande reçue — paiement en espèces à la livraison');
    return getOrder(orderId);
  });
  onOrderPlaced(updated);
  return updated;
}

/** Annule les commandes carte jamais payées (panier abandonné sur Stripe) et libère le stock. */
export function expireUnpaidOrders(maxAgeMinutes = 45) {
  const limit = new Date(Date.now() - maxAgeMinutes * 60e3).toISOString();
  for (const o of all("SELECT id FROM orders WHERE status = 'awaiting_payment' AND created_at < ?", limit)) {
    cancelOrder(o.id, null, 'Paiement non finalisé', { silent: true }).catch((e) => console.error(e));
  }
}

// ——— Statuts ———————————————————————————————————————————————

export function allowedNext(order) {
  if (['delivered', 'cancelled', 'awaiting_payment'].includes(order.status)) return order.status === 'awaiting_payment' ? ['cancelled'] : [];
  const i = FLOW.indexOf(order.status);
  // Sans livreur, on peut tout de même marquer « livrée » (livraison faite par la boutique elle-même).
  const next = FLOW.slice(i + 1).filter((s) => order.driver_id || !['assigned', 'out_for_delivery'].includes(s));
  return [...next, 'cancelled'];
}

export async function setStatus(orderId, to, actor, { reason = '' } = {}) {
  if (to === 'cancelled') return cancelOrder(orderId, actor, reason);
  const o = getOrder(orderId);
  if (!o) throw new HttpError(404, 'Commande introuvable');
  if (!STATUS[to] || to === 'awaiting_payment') throw new HttpError(400, 'Statut inconnu');
  if (!allowedNext(o).includes(to)) throw new HttpError(409, `Impossible de passer de « ${STATUS[o.status].label} » à « ${STATUS[to].label} ».`);
  if (['assigned', 'out_for_delivery'].includes(to) && !o.driver_id) throw new HttpError(409, 'Assignez d’abord un livreur.');
  let finalStatus = to;
  if (to === 'ready' && o.driver_id) finalStatus = 'assigned';
  const updated = tx(() => {
    run('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?', finalStatus, nowIso(), orderId);
    addEvent(orderId, to, STATUS[to].label, actor?.id);
    if (finalStatus !== to) addEvent(orderId, finalStatus, `Prête — ${o.driver_first_name} peut la récupérer`, actor?.id);
    if (to === 'delivered') completeDelivery(o, actor);
    return getOrder(orderId);
  });
  afterStatusChange(o, updated);
  return updated;
}

function completeDelivery(o, actor) {
  const now = nowIso();
  run('UPDATE orders SET delivered_at = ? WHERE id = ?', now, o.id);
  if (o.payment_method === 'cash' && o.payment_status === 'due_on_delivery') {
    run("UPDATE orders SET payment_status = 'paid', cash_collected_at = ? WHERE id = ?", now, o.id);
    run("UPDATE payments SET status = 'paid', updated_at = ? WHERE order_id = ? AND provider = 'cash'", now, o.id);
    addEvent(o.id, 'delivered', `Espèces encaissées : ${money(o.cash_to_collect_cents)}`, actor?.id);
  }
}

function afterStatusChange(before, after) {
  broadcast(after);
  // Commande confirmée par la boutique : elle apparaît chez les livreurs, qui sont prévenus.
  if (after.status === 'confirmed' && before.status === 'received' && !after.driver_id) {
    notify({ audience: 'driver', kind: 'delivery_available', title: `Nouvelle course ${after.number}`,
      body: `${slotLabel(after)} · ${after.postal_code} ${after.city}${after.payment_method === 'cash' ? ` · ${money(after.total_cents)} à encaisser` : ''}`,
      orderId: after.id, link: '/livreur?onglet=disponibles' });
  }
  if (after.status === 'delivered' && before.status !== 'delivered') {
    sendEmail(after.email, orderEmail({ ...after, slot_label: slotLabel(after) }, orderItems(after.id), 'delivered'));
    if (after.user_id) notify({ userId: after.user_id, kind: 'order_delivered', title: `Commande ${after.number} livrée`, body: 'Merci et à bientôt chez Maison Green.', orderId: after.id, link: `/suivi/${after.tracking_token}` });
    notify({ audience: 'admin', kind: 'order_delivered', title: `${after.number} livrée`, body: `par ${after.driver_first_name || 'le livreur'}${after.payment_method === 'cash' ? ` · ${money(after.cash_to_collect_cents)} encaissés` : ''}`, orderId: after.id, link: `/admin/commandes/${after.id}` });
  }
}

export async function cancelOrder(orderId, actor, reason = '', { silent = false } = {}) {
  const o = getOrder(orderId);
  if (!o) throw new HttpError(404, 'Commande introuvable');
  if (['delivered', 'cancelled'].includes(o.status)) throw new HttpError(409, 'Cette commande ne peut plus être annulée.');
  const updated = tx(() => {
    for (const it of orderItems(orderId)) if (it.product_id) run('UPDATE products SET stock = stock + ? WHERE id = ?', it.quantity, it.product_id);
    const payStatus = ['paid', 'partially_refunded'].includes(o.payment_status) ? o.payment_status : (o.payment_method === 'cash' ? 'cancelled' : (o.payment_status === 'failed' ? 'failed' : 'cancelled'));
    run('UPDATE orders SET status = ?, payment_status = ?, cash_to_collect_cents = 0, cancel_reason = ?, updated_at = ? WHERE id = ?',
      'cancelled', payStatus, reason || null, nowIso(), orderId);
    addEvent(orderId, 'cancelled', reason ? `Annulée : ${reason}` : 'Commande annulée', actor?.id);
    return getOrder(orderId);
  });
  let refundError = null;
  if (updated.payment_method === 'card' && ['paid', 'partially_refunded'].includes(updated.payment_status)) {
    try { await refundPayment(orderId, null, actor); } catch (e) { refundError = e.message; }
  }
  const final = getOrder(orderId);
  broadcast(final);
  if (!silent) {
    sendEmail(final.email, orderEmail(final, orderItems(orderId), 'cancelled'));
    if (final.driver_id) notify({ userId: final.driver_id, kind: 'order_cancelled', title: `${final.number} annulée`, body: 'Cette livraison est annulée.', orderId });
  }
  if (refundError) throw new HttpError(502, `Commande annulée, mais le remboursement a échoué : ${refundError}`);
  return final;
}

// ——— Livreurs ———————————————————————————————————————————————

export const drivers = () => all(`SELECT u.id, u.first_name, u.last_name, u.phone, u.email, u.is_active, d.vehicle, d.is_available,
  (SELECT COUNT(*) FROM orders o WHERE o.driver_id = u.id AND o.status IN ('assigned','out_for_delivery','confirmed','preparing','ready')) AS active_count
  FROM users u JOIN drivers d ON d.user_id = u.id WHERE u.role = 'driver' AND u.deleted_at IS NULL ORDER BY u.is_active DESC, u.first_name`);

export function assignDriver(orderId, driverId, actor) {
  const o = getOrder(orderId);
  if (!o) throw new HttpError(404, 'Commande introuvable');
  if (!ACTIVE.includes(o.status) || o.status === 'out_for_delivery') throw new HttpError(409, 'On ne peut plus changer le livreur de cette commande.');
  if (!driverId) {
    run('UPDATE orders SET driver_id = NULL, picked_up_at = NULL, status = CASE WHEN status = ? THEN ? ELSE status END, updated_at = ? WHERE id = ?', 'assigned', 'ready', nowIso(), orderId);
    addEvent(orderId, o.status === 'assigned' ? 'ready' : o.status, 'Livreur retiré', actor?.id);
    const u = getOrder(orderId); broadcast(u); return u;
  }
  const d = one("SELECT u.id, u.first_name FROM users u WHERE u.id = ? AND u.role = 'driver' AND u.is_active = 1", driverId);
  if (!d) throw new HttpError(422, 'Livreur introuvable ou inactif.');
  const updated = tx(() => {
    const status = o.status === 'ready' ? 'assigned' : o.status;
    run('UPDATE orders SET driver_id = ?, status = ?, updated_at = ? WHERE id = ?', d.id, status, nowIso(), orderId);
    addEvent(orderId, 'assigned', `Livreur assigné : ${d.first_name}`, actor?.id);
    return getOrder(orderId);
  });
  notify({ userId: d.id, kind: 'delivery_assigned', title: `Nouvelle livraison ${updated.number}`,
    body: `${updated.address_line1}, ${updated.city} · ${slotLabel(updated)}${updated.payment_method === 'cash' ? ` · ${money(updated.cash_to_collect_cents)} à encaisser` : ''}`,
    orderId, link: `/livreur/courses/${orderId}` });
  broadcast(updated);
  return updated;
}

/** Actions du livreur : accept → pickup → start → deliver */
export async function driverAction(orderId, driver, action) {
  const o = getOrder(orderId);
  if (!o) throw new HttpError(404, 'Course introuvable');
  if (action === 'accept') {
    if (!['confirmed', 'preparing', 'ready'].includes(o.status)) throw new HttpError(409, 'Cette course n’est pas disponible.');
    // Le livreur accepte : la course est à lui, il peut aller la récupérer et la livrer.
    const r = run("UPDATE orders SET driver_id = ?, status = 'assigned', updated_at = ? WHERE id = ? AND driver_id IS NULL AND status IN ('confirmed','preparing','ready')", driver.id, nowIso(), orderId);
    if (r.changes !== 1) throw new HttpError(409, 'Un autre livreur a déjà accepté cette course.');
    addEvent(orderId, 'assigned', `Course acceptée par ${driver.first_name}`, driver.id);
    const u = getOrder(orderId);
    notify({ audience: 'admin', kind: 'driver_accepted', title: `${driver.first_name} a accepté ${u.number}`, orderId, link: `/admin/commandes/${orderId}` });
    broadcast(u); return u;
  }
  if (action === 'refuse') {
    // Le livreur refuse : la commande est annulée, le stock remis et le client remboursé (carte).
    if (o.driver_id || !['confirmed', 'preparing', 'ready'].includes(o.status)) throw new HttpError(409, 'Cette course n’est plus disponible.');
    const u = await cancelOrder(orderId, driver, `Refusée par le livreur (${driver.first_name})`);
    notify({ audience: 'admin', kind: 'driver_refused', title: `${driver.first_name} a refusé ${u.number}`,
      body: u.payment_method === 'card' ? 'Commande annulée, client remboursé.' : 'Commande annulée (espèces : rien à rembourser).', orderId, link: `/admin/commandes/${orderId}` });
    return u;
  }
  if (Number(o.driver_id) !== Number(driver.id)) throw new HttpError(403, 'Cette course ne vous est pas attribuée.');
  if (action === 'pickup') {
    if (!['confirmed', 'preparing', 'ready', 'assigned'].includes(o.status)) throw new HttpError(409, 'Cette commande ne peut pas être récupérée.');
    tx(() => {
      run("UPDATE orders SET picked_up_at = ?, status = 'assigned', updated_at = ? WHERE id = ?", nowIso(), nowIso(), orderId);
      addEvent(orderId, 'assigned', 'Commande récupérée en boutique', driver.id);
    });
    const u = getOrder(orderId); broadcast(u); return u;
  }
  if (action === 'start') {
    if (!o.picked_up_at) throw new HttpError(409, 'Récupérez d’abord la commande en boutique.');
    return setStatus(orderId, 'out_for_delivery', driver);
  }
  if (action === 'deliver') {
    if (o.status !== 'out_for_delivery') throw new HttpError(409, 'Commencez d’abord la livraison.');
    return setStatus(orderId, 'delivered', driver);
  }
  throw new HttpError(400, 'Action inconnue');
}

export function remitCash(driverId, actor) {
  const rows = all("SELECT id, cash_to_collect_cents FROM orders WHERE driver_id = ? AND cash_collected_at IS NOT NULL AND cash_remitted_at IS NULL", driverId);
  tx(() => {
    for (const r of rows) {
      run('UPDATE orders SET cash_remitted_at = ? WHERE id = ?', nowIso(), r.id);
      addEvent(r.id, 'delivered', `Espèces remises à la boutique (${money(r.cash_to_collect_cents)})`, actor.id);
    }
  });
  return rows.reduce((s, r) => s + r.cash_to_collect_cents, 0);
}
