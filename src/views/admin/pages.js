import { html, raw, money, centsToInput } from '../../lib/html.js';
import { icon, statusBadge, paymentBadge, productTag, fieldErr } from '../ui.js';
import { adminLayout } from './layout.js';
import { STATUS, PAYMENT_STATUS, allowedNext, slotLabel } from '../../services/orders.js';
import { fmtDateTime, fmtTime, WEEKDAYS, dayLabel, hLabel, shortDate } from '../../lib/time.js';

const sel = (a, b) => raw(String(a) === String(b) ? 'selected' : '');
const chk = (v) => raw(v ? 'checked' : '');
const fcls = (errors, n) => (errors?.[n] ? 'field has-error' : 'field');
const mapsUrl = (o) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.address_line1}, ${o.postal_code} ${o.city}`)}`;

// ——— Tableau de bord ——————————————————————————————————————————

import { getSetting as __gs } from '../../db.js';
const getSettingSafe = (k) => __gs(k, '') || '';
export function dashboardPage(ctx, s) {
  const max = Math.max(...s.series.map((d) => d.total), 1);
  const topMax = Math.max(...s.top.map((t) => t.qty), 1);
  const body = html`
  <div class="pro-head">
    <div><h1 class="h1">Bonjour ${ctx.user.first_name}</h1><p>${s.todayLabel} · ${s.state.accepting ? (s.state.isToday ? `prochain créneau ${s.state.nextSlot.label}` : s.state.message) : html`<strong style="color:var(--danger)">${s.state.message}</strong>`}</p></div>
    <div class="row wrap-row"><a class="btn btn-ghost btn-sm" href="/admin/horaires">${icon('settings')} Prise de commande</a><a class="btn btn-dark btn-sm" href="/admin/commandes">${icon('receipt')} Toutes les commandes</a></div>
  </div>

  ${s.backupDue ? html`<div class="notice notice-warn" style="margin-bottom:16px">${icon('alert')}<span>Pas de sauvegarde depuis plus d'un mois. <a class="link" href="/admin/horaires#sauvegarde">Télécharger une sauvegarde</a> (30 secondes).</span></div>` : ''}
  <div class="kpis">
    <div class="kpi accent"><span class="k-label">Chiffre d'affaires du jour</span><span class="k-value">${money(s.today.revenue)}</span><span class="k-sub">${s.today.count} commande${s.today.count > 1 ? 's' : ''} · panier moyen ${money(s.today.count ? Math.round(s.today.revenue / s.today.count) : 0)}</span></div>
    <a class="kpi" href="/admin/commandes?vue=en-cours"><span class="k-label">En cours</span><span class="k-value">${s.active}</span><span class="k-sub">${s.toConfirm} à confirmer</span></a>
    <a class="kpi" href="/admin/commandes?vue=livrees"><span class="k-label">Livrées aujourd'hui</span><span class="k-value">${s.deliveredToday}</span><span class="k-sub">${s.cancelled30} annulée${s.cancelled30 > 1 ? 's' : ''} sur 30 jours</span></a>
    ${s.cashDue + s.cashHeld ? html`<a class="kpi cash" href="/admin/commandes?vue=especes"><span class="k-label">Espèces à récupérer</span><span class="k-value">${money(s.cashDue + s.cashHeld)}</span><span class="k-sub">${money(s.cashDue)} à encaisser · ${money(s.cashHeld)} chez les livreurs</span></a>` : ''}
  </div>

  <div class="dash-grid">
    <div class="panels">
      <section class="panel">
        <div class="panel-head"><h2>Chiffre d'affaires — 14 derniers jours</h2><span class="small muted">${money(s.d30.revenue)} sur 30 jours · ${s.d30.count} commandes · <a class="link" href="/admin/chiffre-affaires">par mois et par année</a></span></div>
        <div class="panel-body">
          <div class="bars" role="img" aria-label="Chiffre d'affaires quotidien sur 14 jours">
            ${s.series.map((d, i) => html`<div class="bar ${i === s.series.length - 1 ? 'today' : ''}" title="${d.label} : ${money(d.total)} (${d.count} commande${d.count > 1 ? 's' : ''})">
              ${i === s.series.length - 1 ? html`<span style="color:var(--ink);font-weight:600">${money(d.total).replace(',00', '')}</span>` : ''}
              <i style="height:${Math.round((d.total / max) * 100)}%"></i><span>${d.short}</span></div>`)}
          </div>
          <details class="mt-16 small"><summary class="muted" style="cursor:pointer">Voir les données</summary>
            <table class="table mt-8"><thead><tr><th>Jour</th><th class="r">Commandes</th><th class="r">CA</th></tr></thead><tbody>${s.series.map((d) => html`<tr><td>${d.label}</td><td class="r">${d.count}</td><td class="r">${money(d.total)}</td></tr>`)}</tbody></table>
          </details>
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Commandes en cours</h2><a class="link small" href="/admin/commandes?vue=en-cours">Tout voir</a></div>
        ${ordersTable(s.activeOrders, { compact: true })}
      </section>
    </div>
    <div class="panels">
      <section class="panel">
        <div class="panel-head"><h2>Paiements · 30 jours</h2></div>
        <div class="panel-body">
          <dl class="kv">
            <dt>Carte bancaire</dt><dd class="num"><strong>${money(s.pay.card)}</strong> <span class="muted small">· ${s.pay.cardCount} paiements</span></dd>
            ${s.pay.cash ? html`<dt>Espèces (anciennes commandes)</dt><dd class="num"><strong>${money(s.pay.cash)}</strong> <span class="muted small">· ${s.pay.cashCount} livraisons</span></dd>` : ''}
            <dt>Remboursé</dt><dd class="num">${money(s.pay.refunded)}</dd>
            <dt>Échecs</dt><dd class="num">${s.pay.failed} paiement${s.pay.failed > 1 ? 's' : ''} refusé${s.pay.failed > 1 ? 's' : ''}</dd>
          </dl>
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Produits les plus commandés</h2><span class="small muted">30 jours</span></div>
        <div class="panel-body" style="padding-top:6px;padding-bottom:6px">
          <ol class="rank">${s.top.map((t, i) => html`<li><span class="pos">${i + 1}</span><span>${t.name}</span><span class="num muted small">${t.qty} vendus</span><span class="meter"><i style="width:${Math.round((t.qty / topMax) * 100)}%"></i></span></li>`)}</ol>
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Stock à surveiller</h2><a class="link small" href="/admin/produits?stock=bas">Gérer</a></div>
        <div class="panel-body" style="padding-top:6px;padding-bottom:6px">
          ${s.lowStock.length ? html`<ol class="rank">${s.lowStock.map((p) => html`<li style="grid-template-columns:1fr auto"><a href="/admin/produits/${p.id}" style="text-decoration:none">${p.name}</a><span class="badge ${p.stock === 0 ? 'b-cancelled' : 'b-preparing'} plain">${p.stock === 0 ? 'Épuisé' : `${p.stock} restant${p.stock > 1 ? 's' : ''}`}</span></li>`)}</ol>` : html`<p class="muted small" style="padding:10px 0">Tous les stocks sont confortables.</p>`}
        </div>
      </section>
    </div>
  </div>`;
  return adminLayout(ctx, { title: 'Tableau de bord', active: 'dash', body });
}

export function ordersTable(orders, { compact = false } = {}) {
  if (!orders.length) return html`<div class="panel-body"><p class="muted">Aucune commande ici pour le moment.</p></div>`;
  return html`<div class="table-wrap"><table class="table" data-orders-table>
    <thead><tr><th>Commande</th><th>Client</th>${compact ? '' : html`<th>Adresse</th>`}<th>Créneau</th><th class="r">Montant</th><th>Paiement</th><th>Statut</th><th>Livreur</th></tr></thead>
    <tbody>${orders.map((o) => html`<tr class="clickable" data-href="/admin/commandes/${o.id}">
      <td><a class="strong" href="/admin/commandes/${o.id}" style="text-decoration:none">${o.number}</a><div class="small muted">${fmtTime(o.created_at)}</div></td>
      <td>${o.first_name} ${o.last_name[0] || ''}.${compact ? '' : html`<div class="small muted">${o.phone}</div>`}</td>
      ${compact ? '' : html`<td class="small">${o.address_line1}<div class="muted">${o.postal_code} ${o.city}</div></td>`}
      <td class="small" style="white-space:nowrap">${dayLabel(o.slot_date)}<div class="muted">${hLabel(o.slot_start)} – ${hLabel(o.slot_end)}</div></td>
      <td class="r strong">${money(o.total_cents)}</td>
      <td>${o.payment_method === 'cash' ? html`<span class="small">${icon('cash')} Espèces</span>` : html`<span class="small">${icon('card')} Carte</span>`}${o.payment_status === 'failed' ? html`<div class="small" style="color:var(--danger)">Échec</div>` : ''}</td>
      <td>${statusBadge(o.status)}</td>
      <td class="small">${o.driver_first_name || html`<span class="muted">—</span>`}</td>
    </tr>`)}</tbody></table></div>`;
}

// ——— Commandes ————————————————————————————————————————————————

export function ordersPage(ctx, { orders, view, q, counts }) {
  const views = [['en-cours', 'En cours'], ['aujourdhui', "Aujourd'hui"], ['especes', 'Espèces'], ['livrees', 'Livrées'], ['annulees', 'Annulées'], ['paiement', 'Paiement en attente'], ['toutes', 'Toutes']]
    .filter(([k]) => k !== 'especes' || counts.especes || view === 'especes');
  const body = html`
  <div class="pro-head"><div><h1 class="h1">Commandes</h1><p>Mises à jour en direct. Cliquez sur une commande pour la traiter.</p></div></div>
  <div class="filters">
    <nav class="seg" aria-label="Filtrer les commandes">${views.map(([k, l]) => html`<a href="/admin/commandes?vue=${k}${q ? `&q=${encodeURIComponent(q)}` : ''}" aria-current="${view === k}">${l}${counts[k] !== undefined ? html`<span class="n">${counts[k]}</span>` : ''}</a>`)}</nav>
    <form class="search" method="get" action="/admin/commandes">${icon('search')}<input type="hidden" name="vue" value="${view}"><label class="sr-only" for="oq">Rechercher</label><input class="input" id="oq" name="q" type="search" value="${q}" placeholder="N°, nom, téléphone…"></form>
  </div>
  <section class="panel">${ordersTable(orders)}</section>`;
  return adminLayout(ctx, { title: 'Commandes', active: 'orders', body });
}

export function orderDetailPage(ctx, { order: o, items, events, drivers, payments }) {
  const next = allowedNext(o).filter((s) => s !== 'cancelled');
  const primary = next[0];
  const refundable = o.payment_method === 'card' && ['paid', 'partially_refunded'].includes(o.payment_status);
  const refunded = payments.reduce((s, p) => s + (p.refunded_cents || 0), 0);
  const body = html`
  <div class="pro-head">
    <div>
      <a class="small muted" href="/admin/commandes" style="text-decoration:none">${icon('back')} Commandes</a>
      <h1 class="h1 mt-8">${o.number}</h1>
      <p class="row wrap-row" style="gap:8px;margin-top:10px">${statusBadge(o.status)} ${paymentBadge(o)} <span class="small muted">Passée le ${fmtDateTime(o.created_at)}</span></p>
    </div>
    <div class="actions-row">
      ${primary ? html`<form method="post" action="/admin/commandes/${o.id}/statut"><input type="hidden" name="status" value="${primary}"><button class="btn btn-primary">${icon('check')} ${primaryLabel(primary)}</button></form>` : ''}
    </div>
  </div>

  <div class="order-layout">
    <div class="panels">
      ${o.payment_method === 'cash' && o.payment_status === 'due_on_delivery' ? html`<div class="notice notice-warn">${icon('cash')}<span><strong>Paiement en espèces à la livraison</strong> — le livreur doit encaisser <strong>${money(o.cash_to_collect_cents)}</strong>.</span></div>` : ''}
      ${o.age_check ? html`<div class="notice notice-warn" role="alert">${icon('shield')}<span><strong>Contrôle d'âge obligatoire</strong> — la commande contient des produits réservés aux majeurs (alcool, CBD…). Vérifiez la pièce d'identité du client et ne remettez rien à un mineur.</span></div>` : ''}
      ${o.status === 'awaiting_payment' ? html`<div class="notice">${icon('clock')}<span>Le client n'a pas encore finalisé son paiement par carte. La commande sera annulée automatiquement après 45 minutes et le stock libéré.</span></div>` : ''}
      <section class="panel">
        <div class="panel-head"><h2>${items.reduce((s, i) => s + i.quantity, 0)} articles</h2><span class="small muted">Liste de préparation</span></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Produit</th><th class="r">Qté</th><th class="r">Prix unitaire</th><th class="r">Total</th></tr></thead>
          <tbody>${items.map((i) => html`<tr><td><span class="strong">${i.name}</span> <span class="muted small">${i.unit}</span></td><td class="r strong">${i.quantity}</td><td class="r">${money(i.unit_price_cents)}</td><td class="r">${money(i.line_total_cents)}</td></tr>`)}</tbody>
          <tfoot>
            <tr><td colspan="3" class="r muted">Sous-total</td><td class="r">${money(o.subtotal_cents)}</td></tr>
            <tr><td colspan="3" class="r muted">Livraison (${o.zone_name})</td><td class="r">${money(o.delivery_fee_cents)}</td></tr>
            <tr><td colspan="3" class="r strong">Total</td><td class="r strong">${money(o.total_cents)}</td></tr>
            ${refunded ? html`<tr><td colspan="3" class="r" style="color:var(--danger)">Remboursé</td><td class="r" style="color:var(--danger)">− ${money(refunded)}</td></tr>` : ''}
          </tfoot>
        </table></div>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Traitement</h2></div>
        <div class="panel-body stack" style="--s:20px">
          ${next.length ? html`<div><p class="label" style="margin-bottom:8px">Changer le statut</p><div class="actions-row">
            ${next.map((st) => html`<form method="post" action="/admin/commandes/${o.id}/statut"><input type="hidden" name="status" value="${st}"><button class="btn ${st === primary ? 'btn-dark' : 'btn-ghost'} btn-sm">${STATUS[st].label}</button></form>`)}
          </div></div>` : ''}
          ${!['delivered', 'cancelled', 'awaiting_payment', 'out_for_delivery'].includes(o.status) ? html`<form class="inline-form" method="post" action="/admin/commandes/${o.id}/livreur">
            <label class="label" for="drv" style="flex-basis:100%">Livreur</label>
            <select class="select" id="drv" name="driver_id"><option value="">— Aucun —</option>${drivers.filter((d) => d.is_active).map((d) => html`<option value="${d.id}" ${sel(d.id, o.driver_id)}>${d.first_name} ${d.last_name} ${d.is_available ? '' : '(indisponible)'} · ${d.active_count} en cours</option>`)}</select>
            <button class="btn btn-ghost btn-sm">Assigner</button>
          </form>` : ''}
          ${refundable ? html`<form class="inline-form" method="post" action="/admin/commandes/${o.id}/rembourser" data-confirm="Confirmer le remboursement ?">
            <label class="label" for="ra" style="flex-basis:100%">Rembourser (laisser vide pour le montant total restant)</label>
            <input class="input" id="ra" name="amount" inputmode="decimal" placeholder="${centsToInput(o.total_cents - refunded)} €">
            <button class="btn btn-ghost btn-sm">${icon('refresh')} Rembourser</button>
          </form>` : ''}
          ${!['delivered', 'cancelled'].includes(o.status) ? html`<form class="inline-form" method="post" action="/admin/commandes/${o.id}/statut" data-confirm="Annuler la commande ${o.number} ? Le stock sera remis en rayon${o.payment_status === 'paid' ? ' et le client remboursé' : ''}.">
            <input type="hidden" name="status" value="cancelled">
            <label class="label" for="cr" style="flex-basis:100%">Annuler la commande</label>
            <input class="input" id="cr" name="reason" placeholder="Motif (visible par le client)" maxlength="200">
            <button class="btn btn-danger btn-sm">Annuler</button>
          </form>` : ''}
          <form class="stack" style="--s:8px" method="post" action="/admin/commandes/${o.id}/note">
            <label class="label" for="note">Note interne</label>
            <textarea class="textarea" id="note" name="note" maxlength="1000" placeholder="Visible uniquement par l'équipe">${o.internal_note}</textarea>
            <div><button class="btn btn-quiet btn-sm">Enregistrer la note</button></div>
          </form>
        </div>
      </section>
    </div>

    <div class="panels">
      <section class="panel"><div class="panel-body">
        <p class="label">Client</p>
        <p class="mt-8"><strong>${o.first_name} ${o.last_name}</strong><br><a class="link" href="tel:${o.phone.replace(/\s/g, '')}">${o.phone}</a><br><span class="small muted">${o.email}</span></p>
        <hr class="sep">
        <p class="label">Livraison · ${o.zone_name}</p>
        <p class="mt-8">${o.address_line1}${o.address_line2 ? html`<br>${o.address_line2}` : ''}<br>${o.postal_code} ${o.city}</p>
        ${o.instructions ? html`<div class="instr mt-8"><strong>Instructions</strong>${o.instructions}</div>` : ''}
        <p class="mt-8 small">${icon('clock')} ${slotLabel(o)}</p>
        <a class="btn btn-ghost btn-sm mt-16" href="${mapsUrl(o)}" target="_blank" rel="noopener">${icon('pin')} Ouvrir dans Maps</a>
        ${o.driver_first_name ? html`<hr class="sep"><p class="label">Livreur</p><p class="mt-8"><strong>${o.driver_first_name} ${o.driver_last_name}</strong> · <a class="link" href="tel:${(o.driver_phone || '').replace(/\s/g, '')}">${o.driver_phone}</a>${o.picked_up_at ? html`<br><span class="small muted">Récupérée à ${fmtTime(o.picked_up_at)}</span>` : ''}</p>` : ''}
      </div></section>
      <section class="panel"><div class="panel-head"><h2>Paiement</h2></div><div class="panel-body">
        <dl class="kv" style="grid-template-columns:110px 1fr">
          <dt>Mode</dt><dd>${o.payment_method === 'cash' ? 'Espèces à la livraison' : 'Carte bancaire'}</dd>
          <dt>Statut</dt><dd>${PAYMENT_STATUS[o.payment_status]}</dd>
          ${o.payment_method === 'cash' ? html`<dt>À encaisser</dt><dd class="strong">${money(o.cash_to_collect_cents)}</dd>
            <dt>Encaissé</dt><dd>${o.cash_collected_at ? fmtDateTime(o.cash_collected_at) : '—'}</dd>
            <dt>Remis</dt><dd>${o.cash_remitted_at ? fmtDateTime(o.cash_remitted_at) : o.cash_collected_at ? html`<span style="color:var(--warn)">Chez le livreur</span>` : '—'}</dd>` : ''}
          ${payments.filter((p) => p.payment_intent_id).map((p) => html`<dt>Stripe</dt><dd class="small" style="word-break:break-all">${p.payment_intent_id}</dd>`)}
        </dl>
      </div></section>
      <section class="panel"><div class="panel-head"><h2>Historique</h2></div><div class="panel-body">
        <ul class="events">${events.map((e) => html`<li><time>${fmtTime(e.created_at)}</time><span>${e.label || STATUS[e.status]?.label}${e.actor_name ? html` <span class="muted">· ${e.actor_name}</span>` : ''}</span></li>`)}</ul>
      </div></section>
    </div>
  </div>`;
  return adminLayout(ctx, { title: o.number, active: 'orders', body });
}
const primaryLabel = (s) => ({ confirmed: 'Confirmer la commande', preparing: 'Commencer la préparation', ready: 'Marquer comme prête', assigned: 'Livreur assigné', out_for_delivery: 'En livraison', delivered: 'Marquer comme livrée' }[s] || STATUS[s].label);

// ——— Produits ————————————————————————————————————————————————

export function productsPage(ctx, { products, categories, q, category, stockFilter }) {
  const body = html`
  <div class="pro-head"><div><h1 class="h1">Produits</h1><p>${products.length} produit${products.length > 1 ? 's' : ''} · les modifications sont visibles immédiatement dans la boutique.</p></div>
    <div class="row wrap-row"><a class="btn btn-ghost btn-sm" href="/admin/produits/import">${icon('download')} Importer / exporter</a><a class="btn btn-primary" href="/admin/produits/nouveau">${icon('plus')} Nouveau produit</a></div></div>
  <form class="filters" method="get" action="/admin/produits">
    <div class="search">${icon('search')}<label class="sr-only" for="pq">Rechercher</label><input class="input" id="pq" name="q" value="${q}" placeholder="Rechercher un produit"></div>
    <select class="select" name="categorie" style="width:auto;min-height:40px" data-autosubmit><option value="">Tous les rayons</option>${categories.map((c) => html`<option value="${c.id}" ${sel(c.id, category)}>${c.name}</option>`)}</select>
    <select class="select" name="stock" style="width:auto;min-height:40px" data-autosubmit><option value="">Tous les stocks</option><option value="bas" ${sel('bas', stockFilter)}>Stock bas (≤ 5)</option></select>
  </form>
  <section class="panel"><div class="table-wrap"><table class="table">
    <thead><tr><th class="thumb"></th><th>Produit</th><th>Rayon</th><th class="r">Prix</th><th class="r">Stock</th><th>En ligne</th><th></th></tr></thead>
    <tbody>${products.map((p) => html`<tr>
      <td class="thumb">${productTag(p)}</td>
      <td><a class="strong" href="/admin/produits/${p.id}" style="text-decoration:none">${p.name}</a>${p.is_featured ? html` <span class="badge plain" style="height:20px;font-size:11px">Vedette</span>` : ''}<div class="small muted">${p.unit}</div></td>
      <td class="small">${p.category_name || '—'}</td>
      <td class="r strong">${money(p.price_cents)}</td>
      <td class="r"><form class="inline-form" style="justify-content:flex-end;flex-wrap:nowrap" method="post" action="/admin/produits/${p.id}/stock">
        <label class="sr-only" for="st-${p.id}">Stock de ${p.name}</label>
        <input class="input" id="st-${p.id}" name="stock" type="number" min="0" max="99999" value="${p.stock}" style="width:78px;flex:none;text-align:right;${p.stock <= 5 ? `color:${p.stock === 0 ? 'var(--danger)' : 'var(--warn)'};font-weight:600` : ''}" data-autosubmit-change>
      </form></td>
      <td><form method="post" action="/admin/produits/${p.id}/visibilite"><label class="switch"><input type="checkbox" name="is_active" ${chk(p.is_active)} data-autosubmit-change aria-label="${p.name} disponible en ligne"></label></form></td>
      <td class="r"><a class="btn btn-quiet btn-sm" href="/admin/produits/${p.id}" aria-label="Modifier ${p.name}">${icon('edit')}</a></td>
    </tr>`)}</tbody></table></div></section>`;
  return adminLayout(ctx, { title: 'Produits', active: 'products', body });
}

export function importPage(ctx, { count, errors = [], warnings = [], preview = null }) {
  const list = (items, kind) => items.length ? html`<div class="notice ${kind}" style="margin-bottom:16px;align-items:flex-start">${icon(kind === 'notice-error' ? 'alert' : 'info')}<div>
    <strong>${kind === 'notice-error' ? `Rien n'a été importé : ${items.length} problème${items.length > 1 ? 's' : ''} à corriger dans le fichier.` : 'À vérifier :'}</strong>
    <ul style="margin:6px 0 0 18px;padding:0">${items.slice(0, 40).map((e) => html`<li class="small">${e}</li>`)}</ul>${items.length > 40 ? html`<p class="small">… et ${items.length - 40} autre(s).</p>` : ''}</div></div>` : '';
  const upload = html`
  <section class="panel"><div class="panel-head"><h2>1. Préparer le fichier</h2></div><div class="panel-body">
    <p>Un tableau Excel, Numbers ou Google Sheets enregistré au format <strong>CSV</strong>, avec une ligne de titres puis un produit par ligne :</p>
    <div class="table-wrap"><table class="table"><thead><tr><th>Colonne</th><th>Exemple</th><th></th></tr></thead><tbody>
      <tr><td class="strong">nom</td><td>Pommes Belchard</td><td class="small muted">obligatoire</td></tr>
      <tr><td class="strong">ancien_nom</td><td>JNR — Cherry Berry</td><td class="small muted">facultatif, pour renommer une fiche existante en gardant sa photo et son stock</td></tr>
      <tr><td class="strong">rayon</td><td>Fruits & légumes</td><td class="small muted">obligatoire · reprenez le nom exact d'un rayon (voir Catégories), sinon il est créé</td></tr>
      <tr><td class="strong">prix</td><td>3,40</td><td class="small muted">obligatoire · en euros TTC</td></tr>
      <tr><td class="strong">format</td><td>1 kg · 250 g · pièce · lot de 6</td><td class="small muted">« pièce » si vide</td></tr>
      <tr><td class="strong">stock</td><td>40</td><td class="small muted">0 si vide (affiché « épuisé »)</td></tr>
      <tr><td class="strong">origine, description</td><td>Normandie</td><td class="small muted">facultatifs</td></tr>
      <tr><td class="strong">vedette, en_ligne</td><td>oui / non</td><td class="small muted">facultatifs (non / oui par défaut)</td></tr>
      <tr><td class="strong">max_par_commande</td><td>10</td><td class="small muted">facultatif (20 par défaut)</td></tr>
    </tbody></table></div>
    <div class="row wrap-row mt-16"><a class="btn btn-ghost btn-sm" href="/admin/produits/modele.csv">${icon('download')} Modèle vierge</a><a class="btn btn-ghost btn-sm" href="/admin/produits/export.csv">${icon('download')} Exporter le catalogue actuel (${count} produits)</a></div>
  </div></section>
  <section class="panel"><div class="panel-head"><h2>2. Envoyer le fichier</h2></div><div class="panel-body">
    <form method="post" action="/admin/produits/import" enctype="multipart/form-data">
      <div class="field"><label class="label" for="fichier">Fichier CSV</label><input class="input" id="fichier" name="fichier" type="file" accept=".csv,text/csv" required></div>
      <div class="field mt-16"><label class="check"><input type="radio" name="mode" value="maj" checked> <span><strong>Ajouter et mettre à jour</strong> : les fiches reconnues par leur nom, ou par « ancien_nom » et leur format, sont mises à jour et gardent leur photo. Les autres restent.</span></label></div>
      <div class="field"><label class="check"><input type="radio" name="mode" value="remplacer"> <span><strong>Remplacer tout le catalogue</strong> : les produits absents du fichier sont retirés (à utiliser pour supprimer les produits d'exemple). Les rayons restent : un rayon vide n'apparaît pas dans la boutique.</span></label></div>
      <button class="btn btn-dark mt-16">Voir l'aperçu</button> <span class="small muted">Rien n'est modifié avant votre confirmation.</span>
    </form>
  </div></section>`;
  const confirm = preview && html`
  <section class="panel"><div class="panel-head"><h2>Aperçu de « ${preview.filename} » : ${preview.products.length} produit${preview.products.length > 1 ? 's' : ''}</h2></div><div class="panel-body">
    <p>${preview.mode === 'remplacer' ? html`<strong style="color:var(--danger)">Mode remplacement :</strong> les ${count} produits actuels absents de ce fichier seront retirés de la boutique.` : 'Mode ajout / mise à jour : aucun produit ne sera retiré.'}</p>
    <form class="row wrap-row mt-16" method="post" action="/admin/produits/import"><input type="hidden" name="token" value="${preview.token}">
      <button class="btn btn-primary">${icon('check')} Confirmer l'import</button><a class="btn btn-ghost" href="/admin/produits/import">Annuler</a></form>
  </div>
  <div class="table-wrap"><table class="table"><thead><tr><th>Ligne</th><th>Produit</th><th>Rayon</th><th class="r">Prix</th><th class="r">Stock</th><th>En ligne</th></tr></thead>
    <tbody>${preview.products.slice(0, 300).map((p) => html`<tr><td class="small muted">${p.line}</td><td><span class="strong">${p.name}</span>${p.is_featured ? html` <span class="badge plain" style="height:20px;font-size:11px">Vedette</span>` : ''}${p.old_name ? html`<div class="small muted">Renomme : ${p.old_name}</div>` : ''}<div class="small muted">${p.unit}${p.origin ? ` · ${p.origin}` : ''}</div></td>
      <td class="small">${p.category}</td><td class="r strong">${money(p.price)}</td><td class="r">${p.stock === null ? 'conservé' : p.stock}</td><td class="small">${p.is_active === null ? 'conservé' : p.is_active ? 'oui' : 'non'}</td></tr>`)}</tbody></table></div></section>`;
  const body = html`
  <div class="pro-head"><div><a class="small muted" href="/admin/produits" style="text-decoration:none">${icon('back')} Produits</a><h1 class="h1 mt-8">Importer le catalogue</h1>
    <p>Mettez en ligne des dizaines de produits d'un coup à partir d'un tableau. Les photos s'ajoutent ensuite depuis la fiche de chaque produit.</p></div></div>
  ${list(errors, 'notice-error')}${list(warnings, 'notice-warn')}
  ${preview ? confirm : upload}`;
  return adminLayout(ctx, { title: 'Importer le catalogue', active: 'products', body });
}

export function productFormPage(ctx, { product = {}, categories, errors = {}, isNew }) {
  const p = product;
  const body = html`
  <div class="pro-head"><div><a class="small muted" href="/admin/produits" style="text-decoration:none">${icon('back')} Produits</a><h1 class="h1 mt-8">${isNew ? 'Nouveau produit' : p.name}</h1></div></div>
  ${Object.keys(errors).length ? html`<div class="notice notice-error" style="margin-bottom:16px">${icon('alert')}<span>Certains champs sont à corriger.</span></div>` : ''}
  <form method="post" action="${isNew ? '/admin/produits/nouveau' : `/admin/produits/${p.id}`}" enctype="multipart/form-data" novalidate>
    <div class="order-layout">
      <section class="panel"><div class="panel-body form-grid">
        <div class="${fcls(errors, 'name')}"><label for="name">Nom du produit</label><input class="input" id="name" name="name" value="${p.name || ''}" required placeholder="Coca-Cola">${fieldErr(errors, 'name')}</div>
        <div class="grid-2">
          <div class="${fcls(errors, 'price')}"><label for="price">Prix (€ TTC)</label><input class="input" id="price" name="price" inputmode="decimal" value="${p.price_cents !== undefined ? centsToInput(p.price_cents) : ''}" placeholder="2,50">${fieldErr(errors, 'price')}</div>
          <div class="${fcls(errors, 'unit')}"><label for="unit">Format / unité</label><input class="input" id="unit" name="unit" value="${p.unit || ''}" placeholder="1,5 L · le kg · lot de 6">${fieldErr(errors, 'unit')}</div>
          <div class="${fcls(errors, 'stock')}"><label for="stock">Stock disponible</label><input class="input" id="stock" name="stock" type="number" min="0" value="${p.stock ?? 0}">${fieldErr(errors, 'stock')}</div>
          <div class="${fcls(errors, 'max_per_order')}"><label for="mpo">Maximum par commande</label><input class="input" id="mpo" name="max_per_order" type="number" min="1" value="${p.max_per_order ?? 20}">${fieldErr(errors, 'max_per_order')}</div>
          <div class="${fcls(errors, 'category_id')}"><label for="cat">Catégorie</label><select class="select" id="cat" name="category_id">${categories.map((c) => html`<option value="${c.id}" ${sel(c.id, p.category_id)}>${c.name}</option>`)}</select>${fieldErr(errors, 'category_id')}</div>
          <div class="field"><label for="origin">Origine <span class="muted" style="font-weight:400">(facultatif)</span></label><input class="input" id="origin" name="origin" value="${p.origin || ''}" placeholder="Normandie"></div>
        </div>
        <div class="${fcls(errors, 'description')}"><label for="desc">Description</label><textarea class="textarea" id="desc" name="description" rows="4">${p.description || ''}</textarea>${fieldErr(errors, 'description')}</div>
        <div class="row wrap-row" style="gap:28px">
          <label class="switch"><input type="checkbox" name="is_active" ${chk(p.is_active ?? 1)}> Disponible à la vente</label>
          <label class="switch"><input type="checkbox" name="is_featured" ${chk(p.is_featured)}> Mis en avant sur l'accueil</label>
        </div>
      </div></section>
      <section class="panel"><div class="panel-body image-drop">
        <p class="label">Photo</p>
        ${productTag({ ...p, name: p.name || 'Aperçu', category_name: categories.find((c) => c.id === p.category_id)?.name, tone: categories.find((c) => c.id === p.category_id)?.tone })}
        <input class="input" type="file" name="image" accept="image/jpeg,image/png,image/webp" style="min-height:auto">
        <input class="input mt-8" type="url" name="image_web" placeholder="ou collez l'adresse web d'une photo (https://…)" inputmode="url">
        <p class="small muted">JPEG, PNG ou WebP, 5 Mo maximum. Format carré conseillé. Sans photo, l'étiquette Maison Green s'affiche automatiquement.</p>
        ${fieldErr(errors, 'image')}
        ${p.image_url ? html`<label class="check"><input type="checkbox" name="remove_image"> Retirer la photo actuelle</label>` : ''}
      </div></section>
    </div>
    <div class="form-actions">
      <a class="btn btn-ghost" href="/admin/produits">Annuler</a>
      <button class="btn btn-primary">${isNew ? 'Créer le produit' : 'Enregistrer'}</button>
    </div>
  </form>
  ${!isNew ? html`<form method="post" action="/admin/produits/${p.id}/supprimer" class="mt-24" data-confirm="Supprimer « ${p.name} » ? Il disparaîtra de la boutique (l'historique des commandes est conservé).">
    <button class="btn btn-danger btn-sm">${icon('trash')} Supprimer ce produit</button></form>` : ''}`;
  return adminLayout(ctx, { title: isNew ? 'Nouveau produit' : p.name, active: 'products', body });
}

// ——— Catégories ——————————————————————————————————————————————

const TONES = [['sage', 'Sauge'], ['sky', 'Ciel'], ['sand', 'Sable'], ['blush', 'Rose poudré'], ['butter', 'Beurre'], ['stone', 'Pierre']];
export function categoriesPage(ctx, { categories, errors = {} }) {
  const row = (c) => html`<form class="inline-form" method="post" action="/admin/categories/${c.id}" style="padding:12px 20px;border-bottom:1px solid var(--line)">
    <span class="tag tone-${c.tone}" style="width:36px;height:36px;padding:0;border-radius:8px;flex:none" aria-hidden="true"></span>
    <input class="input" name="name" value="${c.name}" aria-label="Nom" style="flex:2 1 180px">
    <input class="input" name="description" value="${c.description}" aria-label="Description" placeholder="Description" style="flex:3 1 220px">
    <select class="select" name="tone" aria-label="Teinte" style="flex:0 1 140px">${TONES.map(([k, l]) => html`<option value="${k}" ${sel(k, c.tone)}>${l}</option>`)}</select>
    <input class="input" name="position" type="number" value="${c.position}" aria-label="Ordre" style="flex:0 0 72px">
    <label class="switch" title="Visible"><input type="checkbox" name="is_active" ${chk(c.is_active)}><span class="small">${c.product_count} produits</span></label>
    <label class="switch" title="Réservé aux 18 ans et plus"><input type="checkbox" name="age_restricted" ${chk(c.age_restricted)}><span class="small">18+</span></label>
    <input class="input" name="legal_notice" value="${c.legal_notice || ''}" aria-label="Mention légale" placeholder="Mention légale (facultatif)" style="flex:1 1 100%">
    <button class="btn btn-ghost btn-sm">Enregistrer</button>
    <button class="btn btn-quiet btn-sm" formaction="/admin/categories/${c.id}/supprimer" aria-label="Supprimer ${c.name}" data-confirm-click="Supprimer la catégorie « ${c.name} » ?">${icon('trash')}</button>
  </form>`;
  const body = html`
  <div class="pro-head"><div><h1 class="h1">Catégories</h1><p>L'ordre et la teinte s'appliquent aux rayons et aux étiquettes produit de la boutique.</p></div></div>
  <section class="panel">${categories.map(row)}</section>
  <section class="panel"><div class="panel-head"><h2>Nouvelle catégorie</h2></div><div class="panel-body">
    <form class="inline-form" method="post" action="/admin/categories">
      <input class="input" name="name" placeholder="Nom (ex. Surgelés)" required style="flex:2 1 200px">
      <input class="input" name="description" placeholder="Description courte" style="flex:3 1 240px">
      <select class="select" name="tone" style="flex:0 1 140px">${TONES.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select>
      <label class="switch" title="Réservé aux 18 ans et plus"><input type="checkbox" name="age_restricted"><span class="small">18+</span></label>
      <input class="input" name="legal_notice" placeholder="Mention légale (facultatif)" style="flex:1 1 100%">
      <button class="btn btn-dark btn-sm">${icon('plus')} Ajouter</button>
    </form>${fieldErr(errors, 'name')}
  </div></section>`;
  return adminLayout(ctx, { title: 'Catégories', active: 'categories', body });
}

// ——— Zones ——————————————————————————————————————————————————

export function zonesPage(ctx, { zones, errors = {} }) {
  const fields = (z = {}) => html`
    <div class="field" style="flex:2 1 180px"><label>Nom</label><input class="input" name="name" value="${z.name || ''}" placeholder="Rouen centre" required></div>
    <div class="field" style="flex:3 1 240px"><label>Codes postaux</label><input class="input" name="postal_codes" value="${z.postal_codes || ''}" placeholder="76000, 76100"></div>
    <div class="field" style="flex:1 1 100px"><label>Frais (€)</label><input class="input" name="fee" inputmode="decimal" value="${z.fee_cents !== undefined ? centsToInput(z.fee_cents) : ''}" placeholder="2,99"></div>
    <div class="field" style="flex:1 1 110px"><label>Offerte dès (€)</label><input class="input" name="free_over" inputmode="decimal" value="${z.free_over_cents ? centsToInput(z.free_over_cents) : ''}" placeholder="—"></div>
    <div class="field" style="flex:1 1 90px"><label>Délai (min)</label><input class="input" name="eta_minutes" type="number" min="5" value="${z.eta_minutes ?? 45}"></div>`;
  const body = html`
  <div class="pro-head"><div><h1 class="h1">Zones de livraison</h1><p>Le code postal saisi par le client détermine la zone et les frais de livraison. Il n'y a pas de minimum de commande.</p></div></div>
  ${errors.form ? html`<div class="notice notice-error" style="margin-bottom:16px">${icon('alert')}<span>${errors.form}</span></div>` : ''}
  ${zones.map((z) => html`<section class="panel"><form class="panel-body inline-form" style="align-items:flex-end" method="post" action="/admin/zones/${z.id}">
    ${fields(z)}
    <label class="switch" style="padding-bottom:10px"><input type="checkbox" name="is_active" ${chk(z.is_active)}> Active</label>
    <button class="btn btn-ghost btn-sm">Enregistrer</button>
    <button class="btn btn-quiet btn-sm" formaction="/admin/zones/${z.id}/supprimer" aria-label="Supprimer la zone" data-confirm-click="Supprimer la zone « ${z.name} » ?">${icon('trash')}</button>
  </form></section>`)}
  <section class="panel"><div class="panel-head"><h2>Nouvelle zone</h2></div><form class="panel-body inline-form" style="align-items:flex-end" method="post" action="/admin/zones">
    ${fields()}<button class="btn btn-dark btn-sm">${icon('plus')} Ajouter</button>
  </form></section>`;
  return adminLayout(ctx, { title: 'Zones', active: 'zones', body });
}

// ——— Horaires & créneaux ————————————————————————————————————————

export function hoursPage(ctx, { hours, slots, closures, settings, shop, lastBackup = null, resetCounts = { orders: 0, customers: 0 }, errors = {} }) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const byDay = (wd) => slots.filter((s) => s.weekday === wd);
  const body = html`
  <div class="pro-head"><div><h1 class="h1">Horaires & créneaux</h1><p>Ce qui est proposé au client au moment de commander.</p></div></div>
  ${errors.form ? html`<div class="notice notice-error" style="margin-bottom:16px">${icon('alert')}<span>${errors.form}</span></div>` : ''}
  <section class="panel"><div class="panel-head"><h2>Prise de commande</h2>${settings.paused ? html`<span class="badge b-cancelled">Suspendue</span>` : html`<span class="badge b-paid">Ouverte</span>`}</div>
    <form class="panel-body form-grid" method="post" action="/admin/horaires/reglages">
      <label class="switch"><input type="checkbox" name="orders_paused" ${chk(settings.paused)}> Suspendre temporairement les commandes</label>
      <div class="grid-2">
        <div class="field"><label for="pm">Message affiché pendant la suspension</label><input class="input" id="pm" name="pause_message" value="${settings.pauseMessage}"></div>
        <div class="field"><label for="lt">Délai minimum avant un créneau (minutes)</label><input class="input" id="lt" name="lead_time_minutes" type="number" min="0" max="1440" value="${settings.leadTime}"><span class="hint">Un créneau qui commence dans moins de ${settings.leadTime} min n'est plus proposé.</span></div>
      </div>
      <div><button class="btn btn-dark btn-sm">Enregistrer</button></div>
    </form>
  </section>

  <section class="panel"><div class="panel-head"><h2>Horaires d'ouverture de la boutique</h2></div>
    <form class="panel-body" method="post" action="/admin/horaires/ouverture">
      <div class="hours-table">${order.map((wd) => { const h = hours.find((x) => x.weekday === wd); return html`<div class="hrow">
        <strong>${WEEKDAYS[wd]}</strong>
        <label class="switch"><input type="checkbox" name="open_${wd}" ${chk(h?.is_open)} aria-label="Ouvert le ${WEEKDAYS[wd]}"></label>
        <input class="input" type="time" name="opens_${wd}" value="${h?.opens_at || '09:00'}" aria-label="Ouverture ${WEEKDAYS[wd]}">
        <input class="input" type="time" name="closes_${wd}" value="${h?.closes_at || '20:00'}" aria-label="Fermeture ${WEEKDAYS[wd]}">
      </div>`; })}</div>
      <p class="small muted mt-16">Un jour fermé n'a aucun créneau de livraison.</p>
      <div class="mt-16"><button class="btn btn-dark btn-sm">Enregistrer les horaires</button></div>
    </form>
  </section>

  <section class="panel"><div class="panel-head"><h2>Créneaux de livraison</h2><span class="small muted">Capacité = nombre de commandes max. par créneau</span></div>
    <div class="panel-body">
      ${order.map((wd) => html`<div class="slot-day"><strong>${WEEKDAYS[wd]}</strong><div class="chips-wrap">
        ${byDay(wd).length ? byDay(wd).map((s) => html`<span class="slot-chip ${s.is_active ? '' : 'off'}">${hLabel(s.starts_at)}–${hLabel(s.ends_at)} <span class="muted">· ${s.capacity}</span>
          <form method="post" action="/admin/creneaux/${s.id}/basculer" style="display:inline"><button title="${s.is_active ? 'Désactiver' : 'Réactiver'}" aria-label="${s.is_active ? 'Désactiver' : 'Réactiver'} le créneau">${icon(s.is_active ? 'minus' : 'plus')}</button></form>
          <form method="post" action="/admin/creneaux/${s.id}/supprimer" style="display:inline"><button title="Supprimer" aria-label="Supprimer le créneau">${icon('x')}</button></form></span>`) : html`<span class="small muted">Aucun créneau</span>`}
      </div></div>`)}
      <form class="inline-form mt-24" method="post" action="/admin/creneaux" style="align-items:flex-end">
        <div class="field" style="flex:1 1 140px"><label>Jour</label><select class="select" name="weekday"><option value="every">Tous les jours</option><option value="all">Du lundi au samedi</option>${order.map((wd) => html`<option value="${wd}">${WEEKDAYS[wd]}</option>`)}</select></div>
        <div class="field" style="flex:1 1 110px"><label>Début</label><input class="input" type="time" name="starts_at" value="13:00"></div>
        <div class="field" style="flex:1 1 110px"><label>Fin</label><input class="input" type="time" name="ends_at" value="14:00"></div>
        <div class="field" style="flex:1 1 90px"><label>Capacité</label><input class="input" type="number" name="capacity" min="1" max="200" value="6"></div>
        <button class="btn btn-dark btn-sm">${icon('plus')} Ajouter</button>
      </form>
    </div>
  </section>

  <section class="panel"><div class="panel-head"><h2>Coordonnées de la boutique</h2></div>
    <form class="panel-body form-grid" method="post" action="/admin/boutique">
      <div class="grid-2">
        <div class="field"><label for="sa">Adresse</label><input class="input" id="sa" name="address" value="${shop.address}" required></div>
        <div class="field"><label for="sp">Code postal</label><input class="input" id="sp" name="postal" value="${shop.postal}" inputmode="numeric" required></div>
        <div class="field"><label for="sc">Ville</label><input class="input" id="sc" name="city" value="${shop.city}" required></div>
        <div class="field"><label for="st">Téléphone</label><input class="input" id="st" name="phone" type="tel" value="${shop.phone}" placeholder="Non affiché s'il est vide"></div>
        <div class="field"><label for="se">E-mail de contact</label><input class="input" id="se" name="email" type="email" value="${shop.email}" required></div>
      </div>
      <div><button class="btn btn-dark btn-sm">Enregistrer</button> <span class="small muted">Affichées en bas du site, dans le suivi de commande, l'espace livreur et les pages légales.</span></div>
    </form>
  </section>

  <section class="panel"><div class="panel-head"><h2>Informations légales</h2></div>
    <form class="panel-body form-grid" method="post" action="/admin/boutique/legal">
      <p class="small muted">Elles complètent automatiquement les <a class="link" href="/mentions-legales" target="_blank">mentions légales</a> et les <a class="link" href="/cgv" target="_blank">CGV</a>. Un champ vide apparaît comme « [à compléter] ».</p>
      <div class="grid-2">
        <div class="field"><label for="lg1">Raison sociale</label><input class="input" id="lg1" name="legal_name" value="${shop.legal_name || 'Maison Green'}"></div>
        <div class="field"><label for="lg2">Forme juridique</label><input class="input" id="lg2" name="legal_form" value="${shop.legal_form || ''}" placeholder="SARL, SAS, EI, micro-entreprise…"></div>
        <div class="field"><label for="lg3">Capital (€)</label><input class="input" id="lg3" name="legal_capital" value="${shop.legal_capital || ''}" inputmode="numeric" placeholder="Vide pour une entreprise individuelle"></div>
        <div class="field"><label for="lg4">SIREN ou SIRET</label><input class="input" id="lg4" name="legal_siren" value="${shop.legal_siren || ''}" inputmode="numeric"></div>
        <div class="field"><label for="lg5">Ville du RCS</label><input class="input" id="lg5" name="legal_rcs" value="${shop.legal_rcs || ''}" placeholder="Rouen (vide si non inscrit)"></div>
        <div class="field"><label for="lg6">N° de TVA intracommunautaire</label><input class="input" id="lg6" name="legal_tva" value="${shop.legal_tva || ''}" placeholder="FR…"></div>
        <div class="field"><label for="lg7">Directeur de la publication (gérant)</label><input class="input" id="lg7" name="legal_manager" value="${shop.legal_manager || ''}"></div>
        <div class="field"><label for="lg8">Médiateur de la consommation</label><input class="input" id="lg8" name="legal_mediator" value="${shop.legal_mediator || ''}" placeholder="Nom et site web du médiateur"></div>
        <div class="field"><label for="lg9">Votre prénom (affiché dans l'admin)</label><input class="input" id="lg9" name="first_name" value="${ctx.user.first_name}" required></div>
        <div class="field"><label for="lg10">Votre nom</label><input class="input" id="lg10" name="last_name" value="${ctx.user.last_name || ''}"></div>
      </div>
      <div><button class="btn btn-dark btn-sm">Enregistrer</button></div>
    </form>
  </section>

  <section class="panel"><div class="panel-head"><h2>Référencement Google</h2></div>
    <form class="panel-body form-grid" method="post" action="/admin/boutique/google">
      <p class="small muted">Search Console → Ajouter une propriété → <strong>Préfixe de l'URL</strong> → méthode « Balise HTML ». Collez ici la balise (ou seulement le code), enregistrez, puis cliquez sur « Valider » chez Google. Plan du site à déclarer : <a class="link" href="/sitemap.xml" target="_blank">/sitemap.xml</a>.</p>
      <div class="field"><label for="gsv">Balise de validation Google</label><input class="input" id="gsv" name="google_verification" value="${getSettingSafe('google_verification')}" placeholder='&lt;meta name="google-site-verification" content="…"&gt;'></div>
      <div><button class="btn btn-dark btn-sm">Enregistrer</button></div>
    </form>
  </section>

  <section class="panel"><div class="panel-head"><h2>Jours sans livraison</h2></div>
    <div class="panel-body">
      ${closures.length ? html`<div class="chips-wrap" style="display:flex;flex-wrap:wrap;gap:6px">${closures.map((c) => html`<span class="slot-chip">${shortDate(c.date)} ${c.date.slice(0, 4)} · ${c.label}<form method="post" action="/admin/fermetures/${c.id}/supprimer" style="display:inline"><button aria-label="Retirer">${icon('x')}</button></form></span>`)}</div>` : html`<p class="small muted">Aucune fermeture exceptionnelle prévue.</p>`}
      <form class="inline-form mt-16" method="post" action="/admin/fermetures" style="align-items:flex-end">
        <div class="field" style="flex:1 1 150px"><label>Date</label><input class="input" type="date" name="date" required></div>
        <div class="field" style="flex:2 1 220px"><label>Motif</label><input class="input" name="label" placeholder="Inventaire, congés…"></div>
        <button class="btn btn-dark btn-sm">${icon('plus')} Ajouter</button>
      </form>
    </div>
  </section>

  <section class="panel" id="sauvegarde"><div class="panel-head"><h2>Sauvegarde des données</h2>${lastBackup ? html`<span class="small muted">Dernière : ${fmtDateTime(lastBackup)}</span>` : html`<span class="badge b-cancelled">Jamais faite</span>`}</div>
    <div class="panel-body">
      <p>Téléchargez une copie complète de la base : commandes, chiffre d'affaires, produits, clients, livreurs et réglages. <strong>Faites-le au moins une fois par mois</strong> et gardez le fichier en lieu sûr (ordinateur, clé USB ou cloud) : l'hébergeur ne fait pas de sauvegarde automatique. Les photos des produits ne sont pas incluses.</p>
      <a class="btn btn-dark btn-sm mt-16" href="/admin/sauvegarde">${icon('download')} Télécharger une sauvegarde</a>
    </div>
  </section>

  <section class="panel" id="remise-a-zero" style="border-color:var(--danger)"><div class="panel-head"><h2>Remise à zéro avant l'ouverture</h2></div>
    <form class="panel-body form-grid" method="post" action="/admin/remise-a-zero">
      <p>Efface les <strong>${resetCounts.orders} commande${resetCounts.orders > 1 ? 's' : ''}</strong> enregistrée${resetCounts.orders > 1 ? 's' : ''} (commandes de test), leur historique et les notifications. Le chiffre d'affaires repart de 0 et la prochaine commande sera la MG-1001.
        Les produits, rayons, zones, horaires, livreurs et réglages sont conservés. <strong>À faire une seule fois, juste avant l'ouverture : c'est définitif.</strong></p>
      <label class="check"><input type="checkbox" name="customers" value="1"> <span>Supprimer aussi les ${resetCounts.customers} compte${resetCounts.customers > 1 ? 's' : ''} client${resetCounts.customers > 1 ? 's' : ''} (comptes de test)</span></label>
      <div class="inline-form" style="align-items:flex-end">
        <div class="field" style="flex:0 1 220px"><label for="rz">Tapez EFFACER pour confirmer</label><input class="input" id="rz" name="confirm" autocomplete="off" required></div>
        <button class="btn btn-danger btn-sm">${icon('trash')} Tout remettre à zéro</button>
      </div>
    </form>
  </section>`;
  return adminLayout(ctx, { title: 'Horaires', active: 'hours', body });
}

// ——— Chiffre d'affaires ——————————————————————————————————————————

export function revenuePage(ctx, { report: r, years }) {
  const t = r.total;
  const max = Math.max(...r.months.map((m) => m.net), 1);
  const evo = r.prev.net ? Math.round(((t.net - r.prev.net) / r.prev.net) * 100) : null;
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
  const body = html`
  <div class="pro-head">
    <div><h1 class="h1">Chiffre d'affaires ${r.year}</h1><p>Commandes livrées ou en cours, hors annulations et remboursements · montants TTC, heure de Paris.</p></div>
    <div class="row wrap-row">
      <form method="get" action="/admin/chiffre-affaires"><label class="sr-only" for="an">Année</label><select class="select" id="an" name="annee" style="width:auto;min-height:40px" data-autosubmit>${years.map((y) => html`<option value="${y}" ${sel(y, r.year)}>${y}</option>`)}</select></form>
      <a class="btn btn-ghost btn-sm" href="/admin/chiffre-affaires/export.csv?annee=${r.year}">${icon('download')} Export comptable (CSV)</a>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi accent"><span class="k-label">CA ${r.year}${r.isCurrent ? ' (depuis le 1er janvier)' : ''}</span><span class="k-value">${money(t.net)}</span>
      <span class="k-sub">${evo === null ? `${r.year - 1} : aucune vente` : html`${evo >= 0 ? '+' : ''}${evo} % par rapport à ${r.year - 1}${r.isCurrent ? ' à la même date' : ''} (${money(r.prev.net)})`}</span></div>
    <div class="kpi"><span class="k-label">Commandes</span><span class="k-value">${t.count}</span><span class="k-sub">panier moyen ${money(t.avg)}</span></div>
    <div class="kpi"><span class="k-label">Produits / livraison</span><span class="k-value">${money(t.products)}</span><span class="k-sub">+ ${money(t.delivery)} de frais de livraison</span></div>
    <div class="kpi cash"><span class="k-label">Part payée par carte</span><span class="k-value">${pct(t.card, t.gross)}</span><span class="k-sub">carte ${money(t.card)} · espèces ${money(t.cash)}${t.refunded ? ` · remboursé ${money(t.refunded)}` : ''}</span></div>
  </div>

  <section class="panel mt-16">
    <div class="panel-head"><h2>Par mois</h2></div>
    <div class="panel-body">
      <div class="bars" role="img" aria-label="Chiffre d'affaires mensuel ${r.year}">
        ${r.months.map((m) => html`<div class="bar" title="${m.label} : ${money(m.net)} (${m.count} commande${m.count > 1 ? 's' : ''})"><i style="height:${Math.round((m.net / max) * 100)}%"></i><span>${m.label.slice(0, 3)}</span></div>`)}
      </div>
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Mois</th><th class="r">Commandes</th><th class="r">CA net TTC</th><th class="r">dont livraison</th><th class="r">Carte</th><th class="r">Espèces</th><th class="r">Remboursé</th><th class="r">Panier moyen</th></tr></thead>
      <tbody>${r.months.map((m) => html`<tr${raw(m.future ? ' style="opacity:.45"' : '')}><td class="strong">${m.label}</td><td class="r">${m.count}</td><td class="r strong">${money(m.net)}</td><td class="r">${money(m.delivery)}</td><td class="r">${money(m.card)}</td><td class="r">${money(m.cash)}</td><td class="r">${m.refunded ? money(m.refunded) : '—'}</td><td class="r">${m.count ? money(m.avg) : '—'}</td></tr>`)}
        <tr style="border-top:2px solid var(--line)"><td class="strong">Total ${r.year}</td><td class="r strong">${t.count}</td><td class="r strong">${money(t.net)}</td><td class="r">${money(t.delivery)}</td><td class="r">${money(t.card)}</td><td class="r">${money(t.cash)}</td><td class="r">${t.refunded ? money(t.refunded) : '—'}</td><td class="r">${t.count ? money(t.avg) : '—'}</td></tr>
      </tbody></table></div>
  </section>
  <p class="small muted mt-16">Toutes les commandes restent enregistrées dans la base : les années précédentes restent consultables avec le sélecteur. L'export CSV liste chaque commande de l'année pour votre comptable.</p>`;
  return adminLayout(ctx, { title: "Chiffre d'affaires", active: 'revenue', body });
}

// ——— Livreurs ————————————————————————————————————————————————

export function driversPage(ctx, { drivers, errors = {}, values = {}, created = null }) {
  // Colonne espèces : seulement s'il reste de l'argent d'anciennes commandes en espèces chez un livreur.
  const cashCol = drivers.some((d) => d.cash_held);
  const cashCell = (d) => html`<td class="r">${d.cash_held ? html`<form method="post" action="/admin/livreurs/${d.id}/especes" class="inline-form" style="justify-content:flex-end;flex-wrap:nowrap" data-confirm="Confirmer la remise de ${money(d.cash_held)} en caisse par ${d.first_name} ?"><strong class="num">${money(d.cash_held)}</strong><button class="btn btn-ghost btn-sm">Remis en caisse</button></form>` : html`<span class="muted">—</span>`}</td>`;
  const body = html`
  <div class="pro-head"><div><h1 class="h1">Livreurs</h1><p>Chaque livreur se connecte sur <strong>/livreur</strong> depuis son téléphone.</p></div></div>
  ${created ? html`<div class="notice notice-success" style="margin-bottom:16px">${icon('check')}<span>${created.reset ? 'Nouveau mot de passe créé.' : 'Compte créé.'} Transmettez ces identifiants à ${created.first_name} : <strong>${created.email}</strong> / <strong>${created.password}</strong>. Notez-les maintenant : le mot de passe ne sera plus affiché (en cas d'oubli, cliquez sur « Nouveau mot de passe »).</span></div>` : ''}
  <section class="panel"><div class="table-wrap"><table class="table">
    <thead><tr><th>Livreur</th><th>Véhicule</th><th class="r">En cours</th><th class="r">Livrées aujourd'hui</th>${cashCol ? html`<th class="r">Espèces détenues</th>` : ''}<th>Statut</th><th></th></tr></thead>
    <tbody>${drivers.map((d) => html`<tr>
      <td><span class="strong">${d.first_name} ${d.last_name}</span><div class="small muted">${d.phone} · ${d.email}</div></td>
      <td class="small">${d.vehicle}</td>
      <td class="r">${d.active_count}</td>
      <td class="r">${d.delivered_today}</td>
      ${cashCol ? cashCell(d) : ''}
      <td>${d.is_active ? (d.is_available ? html`<span class="badge b-paid">Disponible</span>` : html`<span class="badge">En pause</span>`) : html`<span class="badge b-cancelled">Désactivé</span>`}</td>
      <td class="r"><div class="row" style="justify-content:flex-end;gap:4px;flex-wrap:nowrap"><form method="post" action="/admin/livreurs/${d.id}/mot-de-passe"><button class="btn btn-quiet btn-sm">Nouveau mot de passe</button></form><form method="post" action="/admin/livreurs/${d.id}/activer"><button class="btn btn-quiet btn-sm">${d.is_active ? 'Désactiver' : 'Réactiver'}</button></form></div></td>
    </tr>`)}</tbody></table></div></section>
  <section class="panel"><div class="panel-head"><h2>Ajouter un livreur</h2></div>
    <form class="panel-body" method="post" action="/admin/livreurs" novalidate><div class="grid-2">
      <div class="${fcls(errors, 'first_name')}"><label>Prénom</label><input class="input" name="first_name" value="${values.first_name || ''}">${fieldErr(errors, 'first_name')}</div>
      <div class="${fcls(errors, 'last_name')}"><label>Nom</label><input class="input" name="last_name" value="${values.last_name || ''}">${fieldErr(errors, 'last_name')}</div>
      <div class="${fcls(errors, 'email')}"><label>E-mail (identifiant)</label><input class="input" name="email" type="email" value="${values.email || ''}">${fieldErr(errors, 'email')}</div>
      <div class="${fcls(errors, 'phone')}"><label>Téléphone</label><input class="input" name="phone" type="tel" value="${values.phone || ''}">${fieldErr(errors, 'phone')}</div>
      <div class="field"><label>Véhicule</label><select class="select" name="vehicle"><option>Vélo cargo</option><option>Vélo</option><option>Scooter électrique</option><option>Voiture</option><option>À pied</option></select></div>
      <div class="field" style="align-self:end"><button class="btn btn-dark">${icon('plus')} Créer le compte</button></div>
    </div><p class="small muted mt-8">Un mot de passe est généré et affiché une seule fois. En cas d'oubli, « Nouveau mot de passe » en crée un autre.</p></form>
  </section>`;
  return adminLayout(ctx, { title: 'Livreurs', active: 'drivers', body });
}

// ——— Statistiques de fréquentation (anonymes, sans cookie) ———————————————————
export function statsPage(ctx, { r, days }) {
  const max = Math.max(...r.series.map((d) => d.visitors), 1);
  const nf = (n) => new Intl.NumberFormat('fr-FR').format(n);
  const short = (day) => `${Number(day.slice(8))}/${Number(day.slice(5, 7))}`;
  const label = (day) => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
  const names = Object.fromEntries(r.pages.filter((p) => p.name).map((p) => [p.key, p.name]));
  const pageName = (p) => (p === '/' ? 'Accueil' : p === '/boutique' ? 'Boutique' : p.startsWith('/boutique?categorie=') ? `Rayon : ${decodeURIComponent(p.split('=')[1])}` : p.startsWith('/produit/') ? `Produit : ${names[p] || decodeURIComponent(p.slice(9))}` : p);
  const list = (items, total, fmt = (k) => k) => (items.length ? html`<table class="table"><tbody>${items.map((i) => html`<tr><td>${fmt(i.key)}</td><td class="r num">${nf(i.n)}</td><td class="r small muted" style="width:64px;white-space:nowrap">${total ? Math.round((i.n / total) * 100) : 0} %</td></tr>`)}</tbody></table>`
    : html`<p class="panel-body small muted">Pas encore de données.</p>`);
  const totalDevices = r.devices.reduce((s, d) => s + d.n, 0); const totalSources = r.sources.reduce((s, d) => s + d.n, 0);
  const body = html`
  <div class="pro-head">
    <div><h1 class="h1">Statistiques</h1><p>Fréquentation de la boutique en ligne, mesurée de façon anonyme (sans cookie, sans adresse IP).</p></div>
    <nav class="seg" aria-label="Période">${[7, 30, 90].map((n) => html`<a href="/admin/statistiques?jours=${n}" aria-current="${days === n}">${n} jours</a>`)}</nav>
  </div>
  <div class="kpis">
    <div class="kpi accent"><span class="k-label">Visiteurs</span><span class="k-value">${nf(r.visitors)}</span><span class="k-sub">sur ${days} jours</span></div>
    <div class="kpi"><span class="k-label">Pages vues</span><span class="k-value">${nf(r.views)}</span><span class="k-sub">${r.visitors ? (r.views / r.visitors).toFixed(1).replace('.', ',') : '0'} par visiteur</span></div>
    <div class="kpi"><span class="k-label">Commandes</span><span class="k-value">${nf(r.orders)}</span><span class="k-sub">payées, hors annulations</span></div>
    <div class="kpi"><span class="k-label">Taux de conversion</span><span class="k-value">${r.conversion.toFixed(1).replace('.', ',')} %</span><span class="k-sub">visiteurs qui ont commandé</span></div>
  </div>
  <div class="panels mt-24">
    <section class="panel">
      <div class="panel-head"><h2>Visiteurs par jour</h2><span class="small muted">du ${label(r.start)} au ${label(r.end)}</span></div>
      <div class="panel-body">
        <div class="bars" role="img" aria-label="Nombre de visiteurs par jour sur ${days} jours">
          ${r.series.map((d, i) => html`<div class="bar ${i === r.series.length - 1 ? 'today' : ''}" title="${label(d.day)} : ${d.visitors} visiteur${d.visitors > 1 ? 's' : ''}, ${d.views} pages vues, ${d.orders} commande${d.orders > 1 ? 's' : ''}">
            ${i === r.series.length - 1 ? html`<span style="color:var(--ink);font-weight:600">${d.visitors}</span>` : ''}
            <i style="height:${Math.round((d.visitors / max) * 100)}%"></i><span>${days <= 31 && (days <= 14 || i % 3 === 0) ? short(d.day) : ''}</span></div>`)}
        </div>
        <details class="mt-16 small"><summary class="muted" style="cursor:pointer">Voir les données</summary>
          <table class="table mt-8"><thead><tr><th>Jour</th><th class="r">Visiteurs</th><th class="r">Pages vues</th><th class="r">Commandes</th></tr></thead>
          <tbody>${[...r.series].reverse().map((d) => html`<tr><td>${label(d.day)}</td><td class="r">${d.visitors}</td><td class="r">${d.views}</td><td class="r">${d.orders}</td></tr>`)}</tbody></table>
        </details>
      </div>
    </section>
  </div>
  <div class="stats-grid mt-24">
    <section class="panel"><div class="panel-head"><h2>Pages les plus vues</h2></div>${list(r.pages, r.views, pageName)}</section>
    <section class="panel"><div class="panel-head"><h2>D'où viennent les visiteurs</h2></div>${list(r.sources, totalSources)}</section>
    <section class="panel"><div class="panel-head"><h2>Appareils</h2></div>${list(r.devices, totalDevices)}</section>
  </div>
  <p class="small muted mt-24">Astuce : pour savoir ce qui marche, ajoutez <code>?utm_source=instagram</code> (ou flyer, facebook…) à la fin du lien que vous partagez : la source apparaîtra ici.</p>`;
  return adminLayout(ctx, { title: 'Statistiques', active: 'stats', body });
}
