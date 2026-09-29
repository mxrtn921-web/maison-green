import { html, raw } from '../../lib/html.js';
import { doc, logo, icon, flashBox } from '../ui.js';
import { hoursSummary } from '../../services/delivery.js';
import { getSetting } from '../../db.js';
import { shopInfo } from '../../lib/shop.js';

export function shopLayout(ctx, { title, description, body, active = '', state = null, robots = '', hideCartBar = false }) {
  const user = ctx.user;
  const accountHref = !user ? '/connexion' : user.role === 'admin' ? '/admin' : user.role === 'driver' ? '/livreur' : '/compte';
  const accountLabel = !user ? 'Se connecter' : user.role === 'admin' ? 'Administration' : user.role === 'driver' ? 'Espace livreur' : 'Mon compte';
  const nav = [['/boutique', 'Boutique', 'shop'], ['/#livraison', 'Livraison', 'delivery'], ['/#maison', 'La maison', 'about']];
  const shop = shopInfo();

  const strip = state ? (state.accepting
    ? (state.isToday
      ? html`<div class="status-strip"><div class="wrap"><span class="dot-live"></span><span>Livraison aujourd'hui · prochain créneau <strong>${state.nextSlot.label}</strong></span></div></div>`
      : html`<div class="status-strip closed"><div class="wrap">${icon('clock')}<span>${state.message}</span></div></div>`)
    : html`<div class="status-strip closed"><div class="wrap">${icon('info')}<span>${state.message}</span></div></div>`) : '';

  const bodyHtml = html`
<a class="skip" href="#contenu">Aller au contenu</a>
${strip}
<header class="site-header" data-header>
  <div class="wrap">
    ${logo()}
    <nav class="nav" aria-label="Navigation principale">
      ${nav.map(([href, label, key]) => html`<a href="${href}" ${raw(active === key ? 'aria-current="page"' : '')}>${label}</a>`)}
    </nav>
    <div class="header-actions">
      <a class="icon-btn search-toggle" href="/boutique#recherche" aria-label="Rechercher un produit">${icon('search')}</a>
      <a class="icon-btn" href="${accountHref}" aria-label="${accountLabel}" title="${accountLabel}">${icon('user')}</a>
      <button class="cart-btn" type="button" data-open-cart aria-label="Ouvrir le panier">${icon('bag')}<span class="hide-sm">Panier</span><span class="cart-count" data-cart-count>0</span></button>
    </div>
  </div>
</header>
${flashBox(ctx.flash)}
<main id="contenu">${body}</main>
<footer class="site-footer">
  <div class="wrap">
    <div class="footer-top">
      <div class="footer-brand">
        ${logo()}
        <p>L'épicerie de quartier, sélectionnée au comptoir et livrée par notre équipe dans tout Rouen.</p>
      </div>
      <div class="footer-col">
        <h4>Boutique</h4>
        <ul>
          <li>${shop.address}</li>
          <li>${shop.postal} ${shop.city}</li>
          ${shop.phone ? html`<li><a href="${shop.tel}">${shop.phone}</a></li>` : ''}
          <li><a href="mailto:${shop.email}">${shop.email}</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Horaires</h4>
        <ul>${hoursSummary().map((h) => html`<li><span class="muted" style="color:#a9bcb1">${h.day.slice(0, 3)}.</span> ${h.label}</li>`)}</ul>
      </div>
      <div class="footer-col">
        <h4>Informations</h4>
        <ul>
          <li><a href="/boutique">Tous les produits</a></li>
          <li><a href="/#livraison">Zones et délais</a></li>
          <li><a href="/cgv">Conditions de vente</a></li>
          <li><a href="/cgu">Conditions d'utilisation</a></li>
          <li><a href="/confidentialite">Confidentialité</a></li>
          <li><a href="/mentions-legales">Mentions légales</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getFullYear()} Maison Green · Rouen</span>
      <span>Paiement sécurisé par carte bancaire (Stripe)</span>
    </div>
  </div>
</footer>
${hideCartBar ? '' : html`<div class="cart-bar" data-cart-bar><button type="button" data-open-cart><span data-cart-bar-label>Voir le panier</span><span class="pill" data-cart-bar-total>0,00 €</span></button></div>`}
<div class="drawer-backdrop" data-cart-backdrop hidden></div>
<aside class="drawer" data-cart-drawer role="dialog" aria-modal="true" aria-labelledby="cart-title" hidden>
  <div class="drawer-head"><h2 class="h3" id="cart-title">Votre panier</h2><button class="icon-btn" type="button" data-close-cart aria-label="Fermer le panier">${icon('x')}</button></div>
  <div class="drawer-body" data-cart-body></div>
  <div class="drawer-foot" data-cart-foot></div>
</aside>`;
  return doc({ title, description, body: bodyHtml, robots });
}
