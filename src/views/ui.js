// Composants d'interface partagés : icônes, logo, étiquettes produit, badges, mises en page.
import { html, raw, money, esc } from '../lib/html.js';
import { STATUS, PAYMENT_STATUS } from '../services/orders.js';
import { config } from '../config.js';

const P = {
  bag: '<path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 8Z"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9 8.5 6H6M15 9l-2 7h-3"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  phone: '<path d="M5 4h3.5l1.5 4-2 1.3a10 10 0 0 0 6.7 6.7L16 14l4 1.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4Z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  receipt: '<path d="M6 3.5h12v17l-2.5-1.5-2 1.5-1.5-1.5-1.5 1.5-2-1.5L6 20.5v-17Z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
  box: '<path d="M4 7.5 12 4l8 3.5v9L12 20l-8-3.5v-9Z"/><path d="m4 7.5 8 3.5 8-3.5M12 11v9"/>',
  tag: '<path d="M4 12.2V5a1 1 0 0 1 1-1h7.2l7.3 7.3a1.2 1.2 0 0 1 0 1.7l-6.5 6.5a1.2 1.2 0 0 1-1.7 0L4 12.2Z"/><circle cx="8.5" cy="8.5" r="1.3"/>',
  map: '<path d="M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2-6-2Z"/><path d="M9 4.5v13M15 6.5v13"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  users: '<circle cx="9" cy="9" r="3.3"/><path d="M3 19.5c.9-3 3.1-4.6 6-4.6s5.1 1.6 6 4.6"/><path d="M15.5 5.8a3.3 3.3 0 0 1 0 6.4M17.5 14.9c1.7.5 3 1.9 3.5 4.6"/>',
  logout: '<path d="M14 4.5h4a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-4"/><path d="M10 16.5 5.5 12 10 7.5M5.5 12H15"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.8 12.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  cash: '<rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v5M17.5 9.5v5"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4L12 4Z"/><path d="M12 10v4.5M12 17h.01"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-2.5Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  store: '<path d="M4 9.5 5.5 4.5h13L20 9.5M4 9.5v10h16v-10M4 9.5c0 1.4 1.1 2.5 2.7 2.5S9.3 10.9 9.3 9.5c0 1.4 1.2 2.5 2.7 2.5s2.7-1.1 2.7-2.5c0 1.4 1.1 2.5 2.6 2.5S20 10.9 20 9.5"/><path d="M10 19.5v-4.5h4v4.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  refresh: '<path d="M19.5 11A7.5 7.5 0 0 0 6 6.8L4.5 8.5M4.5 13A7.5 7.5 0 0 0 18 17.2l1.5-1.7"/><path d="M4.5 4v4.5H9M19.5 20v-4.5H15"/>',
};
export const icon = (name, cls = '') => raw(`<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`);

/** Monogramme : une étiquette à coins entaillés, « MG » en romain. */
export const logoMark = raw(`<svg class="logo-mark" viewBox="0 0 40 40" aria-hidden="true">
  <path d="M8 2h24a6 6 0 0 0 6 6v24a6 6 0 0 0-6 6H8a6 6 0 0 0-6-6V8a6 6 0 0 0 6-6Z" fill="#1E3B2F"/>
  <path d="M9.2 5h21.6a6.8 6.8 0 0 0 4.2 4.2v21.6a6.8 6.8 0 0 0-4.2 4.2H9.2A6.8 6.8 0 0 0 5 30.8V9.2A6.8 6.8 0 0 0 9.2 5Z" fill="none" stroke="#9FC0AC" stroke-width=".8" opacity=".7"/>
  <text x="20" y="25.6" text-anchor="middle" font-family="Lora, Georgia, serif" font-size="14.5" font-weight="500" fill="#fff" letter-spacing=".3">MG</text>
</svg>`);

export const logo = (href = '/') => html`<a class="logo" href="${href}" aria-label="Maison Green — accueil">${logoMark}<span class="logo-word">Maison <span>Green</span></span></a>`;

/** Visuel produit : photo si disponible, sinon étiquette typographique teintée selon la catégorie. */
export function productTag(p, { lazy = true } = {}) {
  const tone = `tone-${p.tone || 'stone'}`;
  const initial = esc((p.name || '?').trim()[0]);
  if (p.image_url) {
    return html`<div class="tag photo ${tone}" data-initial="${initial}"><img src="${p.image_url}" alt="${p.name}" ${raw(lazy ? 'loading="lazy"' : '')} decoding="async"></div>`;
  }
  return html`<div class="tag ${tone}" data-initial="${initial}" role="img" aria-label="${p.name}">
    <div class="tag-card">
      ${p.category_name ? html`<span class="tag-cat">${p.category_name}</span>` : ''}
      <span class="tag-name">${p.name}</span>
      <span class="tag-rule"></span>
      <span class="tag-unit">${p.origin ? `${p.unit} · ${p.origin}` : p.unit}</span>
    </div></div>`;
}


/** Variétés CBD « puissantes » : 3 petites étoiles dorées à côté du nom. */
const STRONG_CBD = ['gold moroco', 'gold maroc', 'harlequin', 'red cherry', 'strawberry', 'lemon aze', 'lemon haze', 'candy melon', 'kaly kush', 'kali kush'];
const flat = (x) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const isStrongCbd = (p) => {
  const n = flat(p.group_name || p.name);
  const cat = flat(p.category_name || p.category_slug || 'cbd');
  return cat.includes('cbd') && STRONG_CBD.some((k) => n === k || n.startsWith(k + ' '));
};
export const stars = (p) => (isStrongCbd(p)
  ? raw('<span class="stars" role="img" aria-label="Puissant : 3 étoiles">\u2605\u2605\u2605</span>') : '');

export function productCard(p) {
  if (p.variant_count > 1) return variantCard(p);
  const soldOut = p.stock <= 0;
  const low = !soldOut && p.stock <= 5;
  return html`<article class="product ${soldOut ? 'soldout' : ''}" data-product="${p.id}">
    <a class="product-media" href="/produit/${p.slug}" tabindex="-1" aria-hidden="true">
      ${soldOut ? html`<span class="product-flag">Épuisé</span>` : low ? html`<span class="product-flag low">Plus que ${p.stock}</span>` : ''}
      ${productTag(p)}
    </a>
    <div class="product-body">
      <a class="product-name" href="/produit/${p.slug}">${p.name}${stars(p)}</a>
      <span class="product-unit">${p.unit}</span>
      <div class="product-foot">
        <span class="product-price price">${money(p.price_cents)}</span>
        ${soldOut ? '' : addControl(p)}
      </div>
    </div>
  </article>`;
}

/** Carte d'un produit à plusieurs formats : on choisit le format sur la fiche. */
function variantCard(p) {
  const soldOut = p.stock <= 0;
  const labels = p.variants.map((v) => v.name.split(/\s+[—–-]\s+/).pop());
  return html`<article class="product ${soldOut ? 'soldout' : ''}" data-product="${p.id}">
    <a class="product-media" href="/produit/${p.slug}" tabindex="-1" aria-hidden="true">
      ${soldOut ? html`<span class="product-flag">Épuisé</span>` : ''}
      ${productTag({ ...p, name: p.group_name, unit: `${p.variant_count} formats` })}
    </a>
    <div class="product-body">
      <a class="product-name" href="/produit/${p.slug}">${p.group_name}${stars(p)}</a>
      <span class="product-unit">${labels.join(' · ')}</span>
      <div class="product-foot">
        <span class="product-price price"><span class="from">dès</span> ${money(p.min_price_cents)}</span>
        ${soldOut ? '' : html`<a class="add-btn" href="/produit/${p.slug}" aria-label="Choisir le format de ${p.group_name}">${icon('arrow')}<span class="add-label">Choisir</span></a>`}
      </div>
    </div>
  </article>`;
}

/** Bouton « Ajouter » qui devient un sélecteur de quantité (géré par app.js). */
export const addControl = (p, big = false) => html`<div class="add" data-add="${p.id}" data-max="${Math.min(p.stock, p.max_per_order)}" data-name="${p.name}">
  <button type="button" class="add-btn ${big ? 'btn-lg' : ''}" data-act="add" aria-label="Ajouter ${p.name} au panier">${icon('plus')}<span class="add-label">Ajouter</span></button>
</div>`;

export const statusBadge = (s) => html`<span class="badge b-${s}">${STATUS[s]?.short || s}</span>`;
export function paymentBadge(o) {
  if (o.payment_method === 'cash') {
    if (o.payment_status === 'due_on_delivery') return html`<span class="badge b-cash plain">Espèces · à encaisser</span>`;
    if (o.payment_status === 'paid') return html`<span class="badge b-paid plain">Espèces · encaissé</span>`;
    return html`<span class="badge plain">Espèces · ${PAYMENT_STATUS[o.payment_status]}</span>`;
  }
  const cls = { paid: 'b-paid', failed: 'b-failed', refunded: 'b-cancelled', partially_refunded: 'b-preparing' }[o.payment_status] || '';
  return html`<span class="badge ${cls} plain">Carte · ${PAYMENT_STATUS[o.payment_status]}</span>`;
}

export function fieldErr(errors, name) {
  return errors?.[name] ? html`<p class="error-text" id="err-${name}">${icon('alert')}${errors[name]}</p>` : '';
}

export function flashBox(flash) {
  if (!flash) return '';
  const kind = { success: 'notice-success', error: 'notice-error', warn: 'notice-warn' }[flash.type] || '';
  return html`<div class="notice ${kind} flash" role="status" data-autohide>${icon(flash.type === 'error' ? 'alert' : 'check')}<span>${flash.message}</span></div>`;
}

// ——— Document de base ————————————————————————————————————————

export function doc({ title, description = '', body, bodyClass = '', head = '', robots = '', manifest = '/manifest.webmanifest' }) {
  return html`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title ? `${title} — Maison Green` : 'Maison Green — votre épicerie livrée à Rouen'}</title>
<meta name="description" content="${description || 'Maison Green, épicerie de quartier à Rouen : épicerie, cafés, douceurs, vins et CBD livrés chez vous, dans le créneau de votre choix.'}">
${robots ? html`<meta name="robots" content="${robots}">` : ''}
<meta name="theme-color" content="#ffffff">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<link rel="manifest" href="${manifest}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Maison Green">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${title ? `${title} — Maison Green` : 'Maison Green — votre épicerie livrée à Rouen'}">
<meta property="og:description" content="${description || 'Épicerie, cafés, douceurs, vins et CBD livrés chez vous à Rouen, dans le créneau de votre choix.'}">
<meta property="og:image" content="${config.baseUrl}/img/og-image.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="/fonts/Lora-Variable.woff" as="font" type="font/woff" crossorigin>
<link rel="stylesheet" href="/css/app.css?v=${ASSET_V}">
${head}
</head>
<body class="${bodyClass}">
${body}
<script src="/js/app.js?v=${ASSET_V}" defer></script>
</body>
</html>`;
}
export const ASSET_V = Date.now().toString(36);
