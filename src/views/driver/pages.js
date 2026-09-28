import { html, raw, money } from '../../lib/html.js';
import { doc, icon, logoMark, flashBox, statusBadge } from '../ui.js';
import { slotLabel } from '../../services/orders.js';
import { fmtTime, hLabel, dayLabel } from '../../lib/time.js';
import { shopInfo } from '../../lib/shop.js';

const addr = (o) => `${o.address_line1}, ${o.postal_code} ${o.city}`;
const gmaps = (o) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr(o))}&travelmode=bicycling`;
const amaps = (o) => `https://maps.apple.com/?daddr=${encodeURIComponent(addr(o))}&dirflg=w`;
const tel = (p) => `tel:${String(p || '').replace(/\s/g, '')}`;

function driverLayout(ctx, { title, body, driver, tab = null, counts = {} }) {
  const tabs = [['disponibles', 'Nouvelles'], ['mes-courses', 'Mes courses'], ['terminees', 'Terminées']];
  const bodyHtml = html`<div class="driver-app" data-pro="driver">
    <header class="driver-top">
      <div class="row" style="gap:10px">${logoMark}<div class="who"><strong>${ctx.user.first_name}</strong>${driver.vehicle}</div></div>
      <div class="row" style="gap:4px">
        <form method="post" action="/livreur/disponibilite"><label class="switch"><input type="checkbox" name="available" ${raw(driver.is_available ? 'checked' : '')} data-autosubmit-change><span class="small">${driver.is_available ? 'Disponible' : 'En pause'}</span></label></form>
        <form method="post" action="/deconnexion"><button class="icon-btn" aria-label="Se déconnecter">${icon('logout')}</button></form>
      </div>
    </header>
    ${tab ? html`<nav class="driver-tabs">${tabs.map(([k, l]) => html`<a href="/livreur?onglet=${k}" ${raw(tab === k ? 'aria-current="page"' : '')}>${l}${counts[k] ? html`<span class="n">${counts[k]}</span>` : ''}</a>`)}</nav>` : ''}
    ${flashBox(ctx.flash)}
    <div class="notice notice-warn" data-push-banner hidden style="margin:0 16px 12px;align-items:center;flex-wrap:wrap;gap:10px">${icon('bell')}<span data-push-text style="flex:1 1 220px">Activez les alertes sur ce téléphone pour être prévenu même écran verrouillé.</span><button class="btn btn-dark btn-sm" type="button" data-push-enable>Activer les alertes</button></div>
    <main id="contenu">${body}</main>
  </div><div class="toast-stack" data-toasts aria-live="polite"></div>`;
  return doc({ title, body: bodyHtml, bodyClass: 'pro', robots: 'noindex', manifest: '/manifest-livreur.webmanifest' });
}

function payLine(o) {
  if (o.payment_method === 'cash' && o.payment_status === 'due_on_delivery') return html`<span class="cash-mini">À encaisser ${money(o.cash_to_collect_cents)}</span>`;
  if (o.payment_method === 'cash' && o.payment_status === 'paid') return html`<span class="cash-mini" style="background:var(--stone);color:var(--ink-2)">Espèces encaissées ${money(o.total_cents)}</span>`;
  return html`<span class="paid-mini">${icon('check')} Payé par carte</span>`;
}

export function driverHomePage(ctx, { driver, tab, available, mine, done, counts }) {
  const list = tab === 'disponibles' ? available : tab === 'terminees' ? done : mine;
  const empty = {
    disponibles: ['Aucune nouvelle course', 'Les commandes prêtes à partir apparaîtront ici, en direct.'],
    'mes-courses': ['Aucune course en cours', 'Acceptez une course dans l’onglet « Nouvelles ».'],
    terminees: ['Rien pour l’instant', 'Vos livraisons du jour s’afficheront ici.'],
  }[tab];
  const body = html`<div class="driver-list">
    ${tab === 'terminees' && done.length ? html`<div class="panel"><div class="panel-body row between"><span class="small muted">${done.length} livraison${done.length > 1 ? 's' : ''} aujourd'hui</span><span class="small">Espèces à remettre : <strong class="num">${money(counts.cashHeld)}</strong></span></div></div>` : ''}
    ${!driver.is_available && tab === 'disponibles' ? html`<div class="notice notice-warn">${icon('info')}<span>Vous êtes en pause : passez-vous « Disponible » pour recevoir des courses.</span></div>` : ''}
    ${list.length ? list.map((o) => html`<article class="run">
      <a class="run-link" href="/livreur/courses/${o.id}">
        <div class="run-top"><span class="run-num">${o.number}</span>${statusBadge(o.status)}</div>
        <p class="run-addr">${o.address_line1}</p>
        <p class="run-meta">${o.postal_code} ${o.city} · ${tab === 'terminees' ? `livrée à ${fmtTime(o.delivered_at)}` : `${dayLabel(o.slot_date)}, ${hLabel(o.slot_start)}–${hLabel(o.slot_end)}`}</p>
      </a>
      <div class="run-foot">${payLine(o)}
        ${tab === 'disponibles' ? html`<div class="row" style="gap:8px"><form method="post" action="/livreur/courses/${o.id}/refuse" data-confirm="Refuser ${o.number} ? La commande sera annulée et le client remboursé."><button class="btn btn-ghost btn-sm">Refuser</button></form><form method="post" action="/livreur/courses/${o.id}/accept"><button class="btn btn-primary btn-sm" ${raw(driver.is_available ? '' : 'disabled')}>Accepter</button></form></div>`
          : tab === 'mes-courses' ? html`<a class="btn btn-dark btn-sm" href="/livreur/courses/${o.id}">Ouvrir ${icon('chevron')}</a>` : html`<span class="small muted">${money(o.total_cents)}</span>`}
      </div>
    </article>`) : html`<div class="empty"><h2 class="h2">${empty[0]}</h2><p>${empty[1]}</p></div>`}
  </div>`;
  return driverLayout(ctx, { title: 'Mes livraisons', body, driver, tab, counts });
}

export function driverRunPage(ctx, { driver, order: o, items }) {
  const mine = o.driver_id === ctx.user.id;
  const cash = o.payment_method === 'cash' && o.payment_status === 'due_on_delivery';
  let cta = '';
  if (!mine && !o.driver_id) cta = html`<div class="stack" style="--s:10px"><form method="post" action="/livreur/courses/${o.id}/accept"><button class="btn btn-primary btn-block">${icon('check')} Accepter la course</button></form><form method="post" action="/livreur/courses/${o.id}/refuse" data-confirm="Refuser cette course ? La commande sera annulée et le client remboursé."><button class="btn btn-ghost btn-block">Refuser</button></form></div>`;
  else if (mine && ['confirmed', 'preparing', 'ready', 'assigned'].includes(o.status) && !o.picked_up_at) cta = html`<form method="post" action="/livreur/courses/${o.id}/pickup"><button class="btn btn-dark btn-block">${icon('bag')} Récupérer la commande</button></form>`;
  else if (mine && o.status === 'assigned' && o.picked_up_at) cta = html`<form method="post" action="/livreur/courses/${o.id}/start"><button class="btn btn-primary btn-block">${icon('bike')} Commencer la livraison</button></form>`;
  else if (mine && o.status === 'out_for_delivery') cta = html`<form method="post" action="/livreur/courses/${o.id}/deliver" data-confirm="${cash ? `Avez-vous bien encaissé ${money(o.cash_to_collect_cents)} ?` : 'Confirmer la livraison ?'}"><button class="btn btn-primary btn-block">${icon('check')} ${cash ? `Livrée · ${money(o.cash_to_collect_cents)} encaissés` : 'Commande livrée'}</button></form>`;

  const body = html`<div class="driver-detail">
    <a class="small muted" href="/livreur?onglet=${mine ? 'mes-courses' : 'disponibles'}" style="text-decoration:none">${icon('back')} Retour</a>
    <div class="row between"><h1 class="h2">${o.number}</h1>${statusBadge(o.status)}</div>
    ${cash ? html`<div class="cash-banner" role="alert"><div><div class="l">À encaisser</div><div class="v">${money(o.cash_to_collect_cents)}</div></div>${icon('cash')}</div>`
      : html`<div class="notice notice-success">${icon('check')}<span>Commande déjà payée par carte. Rien à encaisser.</span></div>`}
    <div class="panel"><div class="panel-body stack" style="--s:12px">
      <p class="big-addr">${o.address_line1}</p>
      ${o.address_line2 ? html`<p style="font-size:16px;font-weight:600">${o.address_line2}</p>` : ''}
      <p class="muted">${o.postal_code} ${o.city} · ${slotLabel(o)}</p>
      <div class="map-btns">
        <a class="btn btn-ghost" href="${gmaps(o)}" target="_blank" rel="noopener">${icon('pin')} Google Maps</a>
        <a class="btn btn-ghost" href="${amaps(o)}" target="_blank" rel="noopener">${icon('map')} Apple Plans</a>
      </div>
    </div></div>
    ${o.instructions ? html`<div class="instr"><strong>Instructions du client</strong>${o.instructions}</div>` : ''}
    <div class="panel"><div class="panel-body row between">
      <div><p class="strong" style="font-weight:600">${o.first_name} ${o.last_name}</p><p class="small muted">${o.phone}</p></div>
      <a class="btn btn-dark" href="${tel(o.phone)}">${icon('phone')} Appeler</a>
    </div></div>
    <div class="panel"><div class="panel-head"><h2>${items.reduce((s, i) => s + i.quantity, 0)} articles à vérifier</h2></div><div class="panel-body" style="padding-top:4px;padding-bottom:4px">
      ${items.map((i) => html`<div class="line" style="grid-template-columns:36px 1fr;padding:10px 0"><strong class="num">${i.quantity}×</strong><span>${i.name} <span class="muted small">${i.unit}</span></span></div>`)}
    </div></div>
    ${shopInfo().phone ? html`<p class="small muted" style="text-align:center">Un problème ? Boutique : <a class="link" href="${shopInfo().tel}">${shopInfo().phone}</a></p>` : ''}
    ${cta ? html`<div class="driver-cta">${cta}</div>` : ''}
  </div>`;
  return driverLayout(ctx, { title: o.number, body, driver });
}
