import { html, raw, money } from '../../lib/html.js';
import { icon, fieldErr, statusBadge } from '../ui.js';
import { shopLayout } from './layout.js';
import { ACTIVE, slotLabel } from '../../services/orders.js';
import { fmtDateTime } from '../../lib/time.js';

const f = (errors, name) => (errors?.[name] ? 'field has-error' : 'field');

export function loginPage(ctx, { errors = {}, values = {}, next = '' }) {
  const body = html`<div class="wrap"><div class="auth">
    <h1 class="h1">Bon retour parmi nous</h1>
    <p class="muted">Connectez-vous pour retrouver vos commandes et vos adresses.</p>
    ${errors.form ? html`<div class="notice notice-error mt-24" role="alert">${icon('alert')}<span>${errors.form}</span></div>` : ''}
    <form method="post" action="/connexion">
      <input type="hidden" name="suite" value="${next}">
      <div class="field"><label for="email">E-mail</label><input class="input" id="email" name="email" type="email" autocomplete="email" required value="${values.email || ''}"></div>
      <div class="field"><label for="password">Mot de passe</label><input class="input" id="password" name="password" type="password" autocomplete="current-password" required></div>
      <button class="btn btn-primary btn-lg btn-block">Se connecter</button>
    </form>
    <hr class="sep">
    <p class="small muted">Pas encore de compte ? <a class="link" href="/inscription${next ? `?suite=${encodeURIComponent(next)}` : ''}">Créer un compte</a> — ou <a class="link" href="/boutique">commandez sans compte</a>, c'est aussi simple.</p>
  </div></div>`;
  return shopLayout(ctx, { title: 'Connexion', body, robots: 'noindex' });
}

export function registerPage(ctx, { errors = {}, values = {}, next = '' }) {
  const body = html`<div class="wrap"><div class="auth">
    <h1 class="h1">Créer un compte</h1>
    <p class="muted">Vos adresses et vos commandes au même endroit. Deux minutes, pas plus.</p>
    ${errors.form ? html`<div class="notice notice-error mt-24" role="alert">${icon('alert')}<span>${errors.form}</span></div>` : ''}
    <form method="post" action="/inscription" novalidate>
      <input type="hidden" name="suite" value="${next}">
      <div class="hp" aria-hidden="true"><label for="hp-website">Laissez ce champ vide</label><input id="hp-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
      <div class="grid-2">
        <div class="${f(errors, 'first_name')}"><label for="first_name">Prénom</label><input class="input" id="first_name" name="first_name" autocomplete="given-name" required value="${values.first_name || ''}">${fieldErr(errors, 'first_name')}</div>
        <div class="${f(errors, 'last_name')}"><label for="last_name">Nom</label><input class="input" id="last_name" name="last_name" autocomplete="family-name" required value="${values.last_name || ''}">${fieldErr(errors, 'last_name')}</div>
      </div>
      <div class="${f(errors, 'email')}"><label for="email">E-mail</label><input class="input" id="email" name="email" type="email" autocomplete="email" required value="${values.email || ''}">${fieldErr(errors, 'email')}</div>
      <div class="${f(errors, 'phone')}"><label for="phone">Téléphone</label><input class="input" id="phone" name="phone" type="tel" autocomplete="tel" value="${values.phone || ''}">${fieldErr(errors, 'phone')}</div>
      <div class="${f(errors, 'password')}"><label for="password">Mot de passe</label><input class="input" id="password" name="password" type="password" autocomplete="new-password" minlength="10" required><span class="hint">10 caractères minimum.</span>${fieldErr(errors, 'password')}</div>
      <label class="check"><input type="checkbox" name="accept" required> <span>J'ai lu la <a class="link" href="/confidentialite" target="_blank">politique de confidentialité</a>.</span></label>
      ${fieldErr(errors, 'accept')}
      <label class="check"><input type="checkbox" name="marketing_opt_in" ${raw(values.marketing_opt_in ? 'checked' : '')}> <span>Recevoir les arrivages et nouveautés par e-mail (facultatif, désinscription en un clic).</span></label>
      <button class="btn btn-primary btn-lg btn-block">Créer mon compte</button>
    </form>
    <hr class="sep"><p class="small muted">Déjà inscrit ? <a class="link" href="/connexion">Se connecter</a></p>
  </div></div>`;
  return shopLayout(ctx, { title: 'Créer un compte', body, robots: 'noindex' });
}

function accountShell(ctx, tab, inner) {
  const tabs = [['/compte', 'Commandes', 'orders'], ['/compte/adresses', 'Adresses', 'addresses'], ['/compte/profil', 'Profil', 'profile'], ['/compte/donnees', 'Mes données', 'data']];
  const body = html`<div class="wrap" style="padding:36px var(--gutter) 88px;max-width:880px">
    <div class="row between wrap-row" style="margin-bottom:20px">
      <div><h1 class="h1">Bonjour ${ctx.user.first_name}</h1><p class="muted mt-8">${ctx.user.email}</p></div>
      <form method="post" action="/deconnexion"><button class="btn btn-ghost btn-sm">${icon('logout')} Se déconnecter</button></form>
    </div>
    <nav class="tabs">${tabs.map(([h, l, k]) => html`<a href="${h}" ${raw(tab === k ? 'aria-current="page"' : '')}>${l}</a>`)}</nav>
    ${inner}
  </div>`;
  return shopLayout(ctx, { title: 'Mon compte', body, robots: 'noindex' });
}

export function accountOrdersPage(ctx, { orders }) {
  const current = orders.filter((o) => ACTIVE.includes(o.status) || o.status === 'awaiting_payment');
  const past = orders.filter((o) => !current.includes(o));
  const row = (o) => html`<a class="row-link" href="/suivi/${o.tracking_token}">
    <span class="row-title">${o.number} · ${money(o.total_cents)}</span>${statusBadge(o.status)}
    <span class="row-meta">${fmtDateTime(o.created_at)} · ${o.item_count} article${o.item_count > 1 ? 's' : ''}${ACTIVE.includes(o.status) ? ` · livraison ${slotLabel(o)}` : ''}</span>
    <span class="row-meta">${icon('chevron')}</span>
  </a>`;
  return accountShell(ctx, 'orders', html`
    ${current.length ? html`<h2 class="h3" style="margin-bottom:10px">En cours</h2><div class="list-rows" style="margin-bottom:36px">${current.map(row)}</div>` : ''}
    <h2 class="h3" style="margin-bottom:10px">Commandes précédentes</h2>
    ${past.length ? html`<div class="list-rows">${past.map((o) => html`<div class="row-link" style="grid-template-columns:1fr auto">
      <a href="/suivi/${o.tracking_token}" style="text-decoration:none"><span class="row-title">${o.number} · ${money(o.total_cents)}</span><br><span class="row-meta">${fmtDateTime(o.created_at)} · ${o.item_count} article${o.item_count > 1 ? 's' : ''}</span></a>
      <div class="row">${statusBadge(o.status)}<button class="btn btn-ghost btn-sm" type="button" data-reorder='${JSON.stringify(o.items)}'>${icon('refresh')} Recommander</button></div>
    </div>`)}</div>` : html`<p class="muted">Aucune commande pour le moment. <a class="link" href="/boutique">Découvrir la boutique</a></p>`}
  `);
}

export function accountAddressesPage(ctx, { addresses, errors = {}, values = {} }) {
  return accountShell(ctx, 'addresses', html`
    <div class="list-rows">
      ${addresses.map((a) => html`<div class="row-link" style="grid-template-columns:1fr auto">
        <div><span class="row-title">${a.label}${a.is_default ? html` <span class="badge plain" style="margin-left:6px">Par défaut</span>` : ''}</span><br><span class="row-meta">${a.line1}${a.line2 ? `, ${a.line2}` : ''}, ${a.postal_code} ${a.city}</span>${a.instructions ? html`<br><span class="row-meta">« ${a.instructions} »</span>` : ''}</div>
        <div class="row">
          ${a.is_default ? '' : html`<form method="post" action="/compte/adresses/${a.id}/defaut"><button class="btn btn-quiet btn-sm">Par défaut</button></form>`}
          <form method="post" action="/compte/adresses/${a.id}/supprimer"><button class="btn btn-quiet btn-sm" aria-label="Supprimer l'adresse ${a.label}">${icon('trash')}</button></form>
        </div>
      </div>`)}
    </div>
    ${!addresses.length ? html`<p class="muted">Aucune adresse enregistrée.</p>` : ''}
    <h2 class="h3 mt-32" style="margin-bottom:14px">Ajouter une adresse</h2>
    <form method="post" action="/compte/adresses" class="grid-2" novalidate>
      <div class="${f(errors, 'label')}"><label for="label">Nom</label><input class="input" id="label" name="label" placeholder="Domicile, Bureau…" value="${values.label || ''}">${fieldErr(errors, 'label')}</div>
      <div class="${f(errors, 'line1')}"><label for="line1">Adresse</label><input class="input" id="line1" name="line1" autocomplete="address-line1" value="${values.line1 || ''}">${fieldErr(errors, 'line1')}</div>
      <div class="field"><label for="line2">Complément</label><input class="input" id="line2" name="line2" autocomplete="address-line2" value="${values.line2 || ''}"></div>
      <div class="${f(errors, 'postal_code')}"><label for="postal_code">Code postal</label><input class="input" id="postal_code" name="postal_code" inputmode="numeric" maxlength="5" value="${values.postal_code || ''}">${fieldErr(errors, 'postal_code')}</div>
      <div class="${f(errors, 'city')}"><label for="city">Ville</label><input class="input" id="city" name="city" value="${values.city || 'Rouen'}">${fieldErr(errors, 'city')}</div>
      <div class="field"><label for="instructions">Instructions</label><input class="input" id="instructions" name="instructions" value="${values.instructions || ''}" placeholder="Code 4521B, 2e étage"></div>
      <div class="span-2"><button class="btn btn-dark">Enregistrer l'adresse</button></div>
    </form>`);
}

export function accountProfilePage(ctx, { errors = {}, cards = [], stripeOn }) {
  const u = ctx.user;
  return accountShell(ctx, 'profile', html`
    <form method="post" action="/compte/profil" class="grid-2" novalidate>
      <div class="${f(errors, 'first_name')}"><label for="first_name">Prénom</label><input class="input" id="first_name" name="first_name" value="${u.first_name}">${fieldErr(errors, 'first_name')}</div>
      <div class="${f(errors, 'last_name')}"><label for="last_name">Nom</label><input class="input" id="last_name" name="last_name" value="${u.last_name}">${fieldErr(errors, 'last_name')}</div>
      <div class="${f(errors, 'phone')}"><label for="phone">Téléphone</label><input class="input" id="phone" name="phone" type="tel" value="${u.phone}">${fieldErr(errors, 'phone')}</div>
      <div class="field"><label>E-mail</label><input class="input" value="${u.email}" disabled></div>
      <div class="span-2"><button class="btn btn-dark">Enregistrer</button></div>
    </form>
    <h2 class="h3 mt-32" style="margin-bottom:6px">Moyens de paiement</h2>
    <p class="small muted" style="margin-bottom:12px">Vos cartes sont conservées de façon chiffrée par Stripe, notre prestataire certifié PCI-DSS. Maison Green n'a jamais accès à vos numéros de carte.</p>
    ${cards.length ? html`<div class="list-rows">${cards.map((c) => html`<div class="row-link" style="grid-template-columns:1fr auto"><span class="row-title">${c.brand.toUpperCase()} •••• ${c.last4} <span class="row-meta">exp. ${c.exp}</span></span>
      <form method="post" action="/compte/cartes/${c.id}/supprimer"><button class="btn btn-quiet btn-sm">${icon('trash')} Retirer</button></form></div>`)}</div>`
      : html`<p class="small muted">${stripeOn ? 'Aucune carte enregistrée. Vous pourrez en enregistrer une lors de votre prochain paiement.' : 'Disponible une fois Stripe configuré.'}</p>`}
    <h2 class="h3 mt-32" style="margin-bottom:14px">Changer de mot de passe</h2>
    <form method="post" action="/compte/mot-de-passe" class="grid-2" novalidate>
      <div class="${f(errors, 'current')}"><label for="current">Mot de passe actuel</label><input class="input" id="current" name="current" type="password" autocomplete="current-password">${fieldErr(errors, 'current')}</div>
      <div class="${f(errors, 'password')}"><label for="npw">Nouveau mot de passe</label><input class="input" id="npw" name="password" type="password" autocomplete="new-password">${fieldErr(errors, 'password')}</div>
      <div class="span-2"><button class="btn btn-ghost">Mettre à jour</button></div>
    </form>`);
}

export function accountDataPage(ctx) {
  return accountShell(ctx, 'data', html`
    <div class="stack" style="--s:28px;max-width:620px">
      <div><h2 class="h3">Exporter mes données</h2><p class="muted small mt-8">Téléchargez l'ensemble des informations que nous détenons sur vous (profil, adresses, commandes) au format JSON, conformément à l'article 20 du RGPD.</p>
        <a class="btn btn-ghost mt-16" href="/compte/donnees/export">${icon('download')} Télécharger mes données</a></div>
      <div><h2 class="h3">Supprimer mon compte</h2><p class="muted small mt-8">Votre compte, vos adresses et vos sessions sont supprimés immédiatement. Vos commandes passées sont anonymisées et conservées uniquement pour nos obligations comptables (10 ans).</p>
        <form method="post" action="/compte/supprimer" class="mt-16 stack" style="--s:12px" data-confirm="Supprimer définitivement votre compte ?">
          <div class="field"><label for="pw-del">Confirmez avec votre mot de passe</label><input class="input" id="pw-del" type="password" name="password" autocomplete="current-password" required></div>
          <button class="btn btn-danger">${icon('trash')} Supprimer mon compte</button>
        </form></div>
    </div>`);
}

export function legalPage(ctx, { title, sections }) {
  const body = html`<div class="wrap"><article class="prose"><h1 class="h1">${title}</h1>${sections.map(([h, ps]) => html`<h2>${h}</h2>${ps.map((p) => html`<p>${p}</p>`)}`)}</article></div>`;
  return shopLayout(ctx, { title, body });
}

export function errorPage(ctx, status, message) {
  const titles = { 404: 'Page introuvable', 403: 'Accès refusé', 500: 'Une erreur est survenue' };
  const body = html`<div class="wrap"><div class="empty" style="padding:96px 16px">
    <p class="muted small">Erreur ${status}</p>
    <h1 class="h1 mt-8" style="margin-bottom:12px">${titles[status] || 'Oups'}</h1>
    <p>${message || (status === 404 ? "Cette page n'existe pas ou a été déplacée." : 'Merci de réessayer dans un instant.')}</p>
    <div class="row" style="justify-content:center"><a class="btn btn-primary" href="/">Retour à l'accueil</a><a class="btn btn-ghost" href="/boutique">Voir la boutique</a></div>
  </div></div>`;
  return shopLayout(ctx, { title: titles[status] || 'Erreur', body, robots: 'noindex' });
}
