// Paiements : Stripe Checkout (API REST, sans SDK), webhooks signés, remboursements.
// Aucune donnée de carte ne transite par notre serveur : le client paie sur la page hébergée par Stripe.
// Sans STRIPE_SECRET_KEY, un « mode démo » clairement signalé simule le paiement.
import crypto from 'node:crypto';
import { config, stripeEnabled } from '../config.js';
import { one, all, run, nowIso } from '../db.js';
import { HttpError } from '../lib/http.js';
import { money } from '../lib/html.js';
import { notify } from './notify.js';
import { getOrder, orderItems, markPaid, markPaymentFailed } from './orders.js';

function encode(obj, prefix = '', out = []) {
  for (const [k, val] of Object.entries(obj)) {
    if (val === undefined || val === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof val === 'object') encode(val, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
  }
  return out.join('&');
}

export async function stripe(method, path, params = null, idempotencyKey = null) {
  const headers = { Authorization: `Bearer ${config.stripe.secretKey}`, 'Stripe-Version': '2024-06-20' };
  if (params) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await fetch(`https://api.stripe.com/v1${path}`, { method, headers, body: params ? encode(params) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, data?.error?.message || `Erreur Stripe (${res.status})`);
  return data;
}

async function ensureCustomer(user) {
  if (!user) return null;
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const c = await stripe('POST', '/customers', { email: user.email, name: `${user.first_name} ${user.last_name}`.trim(), metadata: { user_id: user.id } });
  run('UPDATE users SET stripe_customer_id = ? WHERE id = ?', c.id, user.id);
  return c.id;
}

/** Démarre le paiement d'une commande et renvoie l'URL vers laquelle rediriger le client. */
export async function startCheckout(order, user) {
  if (!stripeEnabled()) {
    run("INSERT INTO payments (order_id, provider, status, amount_cents) VALUES (?, 'demo', 'pending', ?)", order.id, order.total_cents);
    return `/paiement-demo/${order.tracking_token}`;
  }
  const items = orderItems(order.id);
  const line_items = items.map((i) => ({ quantity: i.quantity, price_data: { currency: 'eur', unit_amount: i.unit_price_cents, product_data: { name: `${i.name}${i.unit ? ` — ${i.unit}` : ''}` } } }));
  if (order.delivery_fee_cents > 0) line_items.push({ quantity: 1, price_data: { currency: 'eur', unit_amount: order.delivery_fee_cents, product_data: { name: `Livraison — ${order.zone_name}` } } });
  const customer = await ensureCustomer(user).catch(() => null);
  const params = {
    mode: 'payment', locale: 'fr', client_reference_id: String(order.id),
    line_items: Object.fromEntries(line_items.map((l, i) => [i, l])),
    metadata: { order_id: order.id, order_number: order.number },
    payment_intent_data: { metadata: { order_id: order.id, order_number: order.number }, description: `Maison Green ${order.number}` },
    success_url: `${config.baseUrl}/commande/retour?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.baseUrl}/suivi/${order.tracking_token}?paiement=annule`,
    expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
  };
  if (customer) { params.customer = customer; params.saved_payment_method_options = { payment_method_save: 'enabled' }; }
  else params.customer_email = order.email;
  const session = await stripe('POST', '/checkout/sessions', params, `checkout-${order.id}-${Date.now()}`);
  run("INSERT INTO payments (order_id, provider, status, amount_cents, checkout_session_id) VALUES (?, 'stripe', 'pending', ?, ?)", order.id, order.total_cents, session.id);
  return session.url;
}

/** Au retour de Stripe, on vérifie l'état réel de la session (utile si le webhook n'est pas encore arrivé). */
export async function confirmCheckoutSession(sessionId) {
  const pay = one('SELECT * FROM payments WHERE checkout_session_id = ?', String(sessionId).slice(0, 255));
  if (!pay) throw new HttpError(404, 'Paiement introuvable');
  if (stripeEnabled()) {
    const s = await stripe('GET', `/checkout/sessions/${encodeURIComponent(sessionId)}`);
    if (s.payment_status === 'paid') markPaid(pay.order_id, { provider: 'stripe', sessionId, paymentIntent: s.payment_intent });
  }
  return getOrder(pay.order_id);
}

/** Vérifie la signature d'un webhook Stripe (en-tête Stripe-Signature). */
export function verifyWebhook(rawBody, header, tolerance = 300) {
  if (!config.stripe.webhookSecret) throw new HttpError(400, 'STRIPE_WEBHOOK_SECRET manquant');
  const parts = Object.fromEntries(String(header || '').split(',').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, val]) => [k, val]));
  const sigs = String(header || '').split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) throw new HttpError(400, 'Signature absente');
  if (Math.abs(Date.now() / 1000 - t) > tolerance) throw new HttpError(400, 'Signature expirée');
  const expected = crypto.createHmac('sha256', config.stripe.webhookSecret).update(`${t}.${rawBody}`).digest('hex');
  const ok = sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
  if (!ok) throw new HttpError(400, 'Signature invalide');
  return JSON.parse(rawBody);
}

export function handleWebhookEvent(event) {
  if (one('SELECT 1 AS x FROM webhook_events WHERE id = ?', event.id)) return; // déjà traité
  run('INSERT INTO webhook_events (id) VALUES (?)', event.id);
  const obj = event.data?.object || {};
  const orderId = Number(obj.metadata?.order_id || obj.client_reference_id);
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      if (obj.payment_status === 'paid' && orderId) markPaid(orderId, { provider: 'stripe', sessionId: obj.id, paymentIntent: obj.payment_intent });
      break;
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
      if (orderId) markPaymentFailed(orderId, event.type.endsWith('expired') ? 'Session de paiement expirée' : 'Paiement refusé');
      break;
    case 'payment_intent.payment_failed':
      if (orderId) markPaymentFailed(orderId, obj.last_payment_error?.message || 'Paiement refusé par la banque');
      break;
    case 'charge.refunded': {
      const pay = one('SELECT * FROM payments WHERE payment_intent_id = ?', obj.payment_intent);
      if (pay) applyRefund(pay.order_id, obj.amount_refunded, null, false);
      break;
    }
    default: break;
  }
}

function applyRefund(orderId, refundedTotal, actor, addNote = true) {
  const o = getOrder(orderId);
  const status = refundedTotal >= o.total_cents ? 'refunded' : 'partially_refunded';
  run('UPDATE orders SET payment_status = ?, updated_at = ? WHERE id = ?', status, nowIso(), orderId);
  run("UPDATE payments SET refunded_cents = ?, status = ?, updated_at = ? WHERE order_id = ? AND status IN ('paid','partially_refunded','refunded')", refundedTotal, status, nowIso(), orderId);
  if (addNote) run('INSERT INTO order_events (order_id, status, label, actor_id) VALUES (?, ?, ?, ?)', orderId, o.status, `Remboursement : ${money(refundedTotal)} au total`, actor?.id ?? null);
}

/** Rembourse tout ou partie d'une commande payée par carte. amountCents = null → reste à rembourser. */
export async function refundPayment(orderId, amountCents, actor) {
  const o = getOrder(orderId);
  const pay = one("SELECT * FROM payments WHERE order_id = ? AND provider IN ('stripe','demo') AND status IN ('paid','partially_refunded') ORDER BY id DESC", orderId);
  if (!o || !pay) throw new HttpError(409, 'Aucun paiement par carte à rembourser sur cette commande.');
  const remaining = o.total_cents - pay.refunded_cents;
  const amount = amountCents == null ? remaining : amountCents;
  if (!(amount > 0) || amount > remaining) throw new HttpError(422, `Montant invalide (maximum ${money(remaining)}).`);
  if (pay.provider === 'stripe') {
    if (!pay.payment_intent_id) throw new HttpError(409, 'Paiement Stripe incomplet : impossible de rembourser automatiquement.');
    await stripe('POST', '/refunds', { payment_intent: pay.payment_intent_id, amount, metadata: { order_id: orderId } }, `refund-${orderId}-${pay.refunded_cents}-${amount}`);
  }
  applyRefund(orderId, pay.refunded_cents + amount, actor);
  notify({ audience: 'admin', kind: 'refund', title: `Remboursement ${o.number}`, body: `${money(amount)} remboursés${pay.provider === 'demo' ? ' (mode démo)' : ''}`, orderId, link: `/admin/commandes/${orderId}` });
  return amount;
}

export const paymentsFor = (orderId) => all('SELECT * FROM payments WHERE order_id = ? ORDER BY id', orderId);

/** Cartes enregistrées chez Stripe pour un client (jamais stockées chez nous). */
export async function savedCards(user) {
  if (!stripeEnabled() || !user.stripe_customer_id) return [];
  const r = await stripe('GET', `/customers/${user.stripe_customer_id}/payment_methods?type=card&limit=10`).catch(() => ({ data: [] }));
  return r.data.map((pm) => ({ id: pm.id, brand: pm.card.brand, last4: pm.card.last4, exp: `${String(pm.card.exp_month).padStart(2, '0')}/${String(pm.card.exp_year).slice(-2)}` }));
}
export async function removeCard(user, pmId) {
  const cards = await savedCards(user);
  if (!cards.some((c) => c.id === pmId)) throw new HttpError(404, 'Carte introuvable');
  await stripe('POST', `/payment_methods/${encodeURIComponent(pmId)}/detach`, {});
}
