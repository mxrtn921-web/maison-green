// Notifications : in-app (table notifications + temps réel) et e-mails (Resend, ou console en local).
import { run, all, one } from '../db.js';
import { publish } from '../lib/events.js';
import { config } from '../config.js';
import { esc, money } from '../lib/html.js';
import { pushTo } from './push.js';

export function notify({ userId = null, audience = null, kind, title, body = '', orderId = null, link = null }) {
  const r = run('INSERT INTO notifications (user_id, audience, kind, title, body, order_id, link) VALUES (?, ?, ?, ?, ?, ?, ?)',
    userId, audience, kind, title, body, orderId, link);
  const payload = { id: Number(r.lastInsertRowid), kind, title, body, link };
  if (audience) publish(audience, 'notification', payload);
  if (userId) publish(`user:${userId}`, 'notification', payload);
  // Alerte push (téléphone verrouillé) pour l'équipe : boutique et livreurs.
  if (audience === 'admin' || audience === 'driver' || userId) pushTo({ userId, audience, message: { ...payload, order_id: orderId } }).catch((e) => console.error(e));
}

export function notificationsFor(user, limit = 20) {
  return all(`SELECT * FROM notifications WHERE user_id = ? OR audience = ? ORDER BY id DESC LIMIT ?`, user.id, user.role, limit);
}
export function unreadCount(user) {
  return one(`SELECT COUNT(*) AS n FROM notifications WHERE (user_id = ? OR audience = ?) AND read_at IS NULL`, user.id, user.role).n;
}
export function markAllRead(user) {
  run(`UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE (user_id = ? OR audience = ?) AND read_at IS NULL`, user.id, user.role);
}

// ——— E-mails ———————————————————————————————————————————————

function layout(title, inner) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#F6F5F1;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#17181A">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="font-family:Georgia,serif;font-size:22px;letter-spacing:.02em;color:#1E3B2F;margin-bottom:24px">Maison Green<span style="color:#1E3B2F">.</span></div>
    <div style="background:#fff;border:1px solid #E7E5DF;border-radius:14px;padding:28px">
      <h1 style="font-family:Georgia,serif;font-weight:500;font-size:24px;margin:0 0 16px">${esc(title)}</h1>
      ${inner}
    </div>
    <p style="font-size:12px;color:#6B6E73;margin-top:24px">Maison Green — épicerie à Rouen. Vous recevez cet e-mail suite à votre commande.</p>
  </div></body></html>`;
}

const btn = (href, label) => `<a href="${esc(href)}" style="display:inline-block;background:#1E3B2F;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:15px">${esc(label)}</a>`;

export function orderEmail(order, items, kind) {
  const url = `${config.baseUrl}/suivi/${order.tracking_token}`;
  const lines = items.map((i) => `<tr><td style="padding:6px 0">${i.quantity} × ${esc(i.name)}</td><td style="text-align:right">${money(i.line_total_cents)}</td></tr>`).join('');
  const recap = `<table style="width:100%;font-size:14px;border-collapse:collapse;margin:16px 0">${lines}
    <tr><td style="padding:6px 0;color:#6B6E73">Livraison</td><td style="text-align:right;color:#6B6E73">${money(order.delivery_fee_cents)}</td></tr>
    <tr><td style="padding:10px 0;border-top:1px solid #E7E5DF;font-weight:700">Total</td><td style="text-align:right;border-top:1px solid #E7E5DF;font-weight:700">${money(order.total_cents)}</td></tr></table>`;
  const payLine = order.payment_method === 'cash'
    ? `<p style="font-size:15px">Paiement en espèces à la livraison : prévoyez <strong>${money(order.total_cents)}</strong>.</p>`
    : '<p style="font-size:15px">Paiement par carte confirmé.</p>';
  if (kind === 'confirmation') {
    return {
      subject: `Commande ${order.number} bien reçue`,
      html: layout(`Merci ${order.first_name}, c'est noté.`, `<p style="font-size:15px;line-height:1.5">Votre commande <strong>${esc(order.number)}</strong> sera livrée le ${esc(order.slot_label)}, au ${esc(order.address_line1)}, ${esc(order.postal_code)} ${esc(order.city)}.</p>${payLine}${recap}${btn(url, 'Suivre ma commande')}`),
    };
  }
  if (kind === 'delivered') {
    return {
      subject: `Commande ${order.number} livrée`,
      html: layout('Votre commande est arrivée.', `<p style="font-size:15px;line-height:1.5">Bonne dégustation ! Merci d'avoir choisi Maison Green. Votre commande <strong>${esc(order.number)}</strong> a été livrée.</p>${recap}${btn(`${config.baseUrl}/boutique`, 'Recommander')}`),
    };
  }
  if (kind === 'cancelled') {
    return {
      subject: `Commande ${order.number} annulée`,
      html: layout('Votre commande a été annulée.', `<p style="font-size:15px;line-height:1.5">Nous sommes désolés : la commande <strong>${esc(order.number)}</strong> a été annulée.${order.payment_method === 'card' && order.payment_status !== 'failed' ? ' Si vous avez été débité, le remboursement est effectué sur votre carte sous 5 à 10 jours.' : ''}</p>${order.cancel_reason ? `<p style="font-size:14px;color:#6B6E73">Motif : ${esc(order.cancel_reason)}</p>` : ''}<p style="font-size:14px">Une question ? Répondez simplement à cet e-mail.</p>`),
    };
  }
  if (kind === 'admin_new') {
    return {
      subject: `Nouvelle commande ${order.number} — ${money(order.total_cents)}`,
      html: layout(`Nouvelle commande ${order.number}`, `<p style="font-size:15px">${esc(order.first_name)} ${esc(order.last_name)} · ${esc(order.phone)}<br>${esc(order.address_line1)}, ${esc(order.postal_code)} ${esc(order.city)}<br>Créneau : ${esc(order.slot_label)}<br>Paiement : ${order.payment_method === 'cash' ? 'espèces à la livraison' : 'carte (payée)'}</p>${recap}${btn(`${config.baseUrl}/admin/commandes/${order.id}`, 'Ouvrir la commande')}`),
    };
  }
  return null;
}

export async function sendEmail(to, mail) {
  if (!to || !mail) return;
  if (!config.email.resendKey) {
    console.log(`\n✉︎  [e-mail simulé] À : ${to}\n   Objet : ${mail.subject}\n   (Ajoutez RESEND_API_KEY dans .env pour envoyer de vrais e-mails)\n`);
    return;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.email.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.email.from, to: [to], subject: mail.subject, html: mail.html }),
    });
    if (!r.ok) console.error('Échec envoi e-mail', r.status, await r.text());
  } catch (err) {
    console.error('Échec envoi e-mail', err.message);
  }
}
