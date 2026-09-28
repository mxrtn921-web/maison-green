import { html, raw, money } from '../../lib/html.js';
import { icon, productTag } from '../ui.js';
import { shopLayout } from './layout.js';
import { FLOW, STATUS, slotLabel } from '../../services/orders.js';
import { fmtTime } from '../../lib/time.js';
import { shopInfo } from '../../lib/shop.js';

const HEADLINES = {
  awaiting_payment: ['Paiement en attente', 'Votre commande sera transmise à la boutique dès le paiement confirmé.'],
  received: ['Commande reçue', 'La boutique va la confirmer dans quelques instants.'],
  confirmed: ['Commande confirmée', 'Nous allons commencer à préparer vos produits.'],
  preparing: ['En préparation', 'Nous rassemblons vos produits en boutique.'],
  ready: ['Prête', 'Votre commande attend son livreur.'],
  assigned: ['Livreur en route vers la boutique', 'Votre commande va bientôt partir.'],
  out_for_delivery: ['En livraison', 'Votre livreur arrive. Gardez votre téléphone à portée de main.'],
  delivered: ['Livrée', 'Bonne dégustation, et merci !'],
  cancelled: ['Commande annulée', ''],
};

export function trackPage(ctx, { order: o, items, events, justPaid, paymentCancelled }) {
  const [title, sub] = HEADLINES[o.status];
  const reached = new Map(); // statut → heure de passage
  for (const e of events) if (!reached.has(e.status)) reached.set(e.status, e.created_at);
  const idx = FLOW.indexOf(o.status);
  const steps = FLOW.map((s, i) => {
    const state = o.status === 'delivered' || i < idx ? 'done' : i === idx ? 'current' : 'todo';
    let label = STATUS[s].label;
    if (s === 'assigned' && o.driver_first_name) label = `Livreur assigné : ${o.driver_first_name}`;
    return { s, state, label, at: reached.get(s) };
  });
  const cashDue = o.payment_method === 'cash' && o.payment_status === 'due_on_delivery';

  const body = html`
<div class="wrap" data-track="${o.tracking_token}" data-status="${o.status}">
  <div class="track">
    <div>
      ${justPaid && o.payment_status === 'paid' ? html`<div class="notice notice-success" style="margin-bottom:24px">${icon('check')}<span>Paiement confirmé. Un e-mail récapitulatif vous a été envoyé à ${o.email}.</span></div>` : ''}
      ${paymentCancelled && o.status === 'awaiting_payment' ? html`<div class="notice notice-warn" style="margin-bottom:24px">${icon('info')}<span>Le paiement n'a pas été finalisé. Votre panier est réservé encore quelques minutes.</span></div>` : ''}
      <p class="muted small">Commande ${o.number}</p>
      <h1 class="track-status mt-8" data-live-title>${title}</h1>
      <p class="track-sub">${o.status === 'cancelled' ? (o.cancel_reason || 'Cette commande a été annulée.') : sub}</p>
      ${o.status !== 'cancelled' && o.status !== 'delivered' ? html`<p class="mt-16 row" style="gap:8px;color:var(--ink-2)">${icon('clock')} Livraison prévue ${slotLabel(o)}</p>` : ''}

      ${o.status === 'awaiting_payment' ? html`
        <div class="panel mt-24"><div class="panel-body stack" style="--s:12px">
          ${o.payment_status === 'failed' ? html`<div class="notice notice-error">${icon('alert')}<span>Le paiement a été refusé. Vous pouvez réessayer avec la même carte ou une autre.</span></div>` : ''}
          <div class="row wrap-row">
            <form method="post" action="/suivi/${o.tracking_token}/payer"><button class="btn btn-primary">${icon('card')} Payer ${money(o.total_cents)}</button></form>
          </div>
        </div></div>` : ''}

      ${o.status !== 'cancelled' && o.status !== 'awaiting_payment' ? html`
      <ol class="timeline" aria-label="Étapes de la commande">
        ${steps.map((st) => html`<li class="tl ${st.state}" ${raw(st.state === 'current' ? 'aria-current="step"' : '')}>
          <span class="tl-dot">${st.state === 'done' ? icon('check') : ''}</span>
          <span class="tl-label"><strong>${st.label}</strong>${st.at && st.state !== 'todo' ? html`<span>${fmtTime(st.at)}</span>` : ''}</span>
        </li>`)}
      </ol>` : ''}

      ${o.driver_first_name && ['assigned', 'out_for_delivery'].includes(o.status) ? html`
        <div class="driver-chip"><span class="avatar">${o.driver_first_name[0]}</span><div><strong>${o.driver_first_name}</strong><div class="small muted">Votre livreur Maison Green</div></div></div>` : ''}

      ${cashDue ? html`<div class="notice notice-warn mt-24">${icon('cash')}<span>Paiement en espèces à la livraison : prévoyez <strong>${money(o.total_cents)}</strong>, l'appoint si possible.</span></div>` : ''}
      ${!ctx.user && o.status !== 'cancelled' ? html`<div class="info-card mt-24"><h3>Gardez vos commandes au même endroit</h3><p class="small">Créez un compte avec ${o.email} pour retrouver cette commande, vos adresses et commander plus vite la prochaine fois.</p><a class="btn btn-ghost btn-sm mt-16" href="/inscription?email=${encodeURIComponent(o.email)}">Créer mon compte</a></div>` : ''}
    </div>

    <aside>
      <div class="info-card">
        <h3>Livraison</h3>
        <p><strong>${o.first_name} ${o.last_name}</strong><br>${o.address_line1}${o.address_line2 ? html`<br>${o.address_line2}` : ''}<br>${o.postal_code} ${o.city}</p>
        ${o.instructions ? html`<p class="small muted mt-8">« ${o.instructions} »</p>` : ''}
      </div>
      <div class="info-card">
        <h3>${items.reduce((s, i) => s + i.quantity, 0)} article${items.length > 1 ? 's' : ''}</h3>
        ${items.map((i) => html`<div class="line" style="grid-template-columns:1fr auto;padding:8px 0"><span class="small"><span class="qty-dot">${i.quantity}×</span> ${i.name}</span><span class="small price">${money(i.line_total_cents)}</span></div>`)}
        <div class="totals mt-8">
          <div class="muted"><span>Sous-total</span><span>${money(o.subtotal_cents)}</span></div>
          <div class="muted"><span>Livraison · ${o.zone_name}</span><span>${o.delivery_fee_cents ? money(o.delivery_fee_cents) : 'Offerte'}</span></div>
          <div class="grand"><span>Total</span><span class="price">${money(o.total_cents)}</span></div>
        </div>
        <p class="small muted mt-16">${o.payment_method === 'cash' ? 'Espèces à la livraison' : 'Carte bancaire'} · ${o.payment_status === 'paid' ? 'payé' : o.payment_status === 'refunded' ? 'remboursé' : o.payment_status === 'due_on_delivery' ? 'à régler au livreur' : 'en attente'}</p>
      </div>
      <p class="small muted mt-16">Une question ? ${shopInfo().phone ? html`Appelez la boutique au <a class="link" href="${shopInfo().tel}">${shopInfo().phone}</a>` : html`Écrivez-nous à <a class="link" href="mailto:${shopInfo().email}">${shopInfo().email}</a>`} en indiquant le numéro ${o.number}.</p>
    </aside>
  </div>
</div>`;
  return shopLayout(ctx, { title: `Suivi ${o.number}`, body, robots: 'noindex' });
}
export { productTag };
