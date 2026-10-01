import { html, money } from '../../lib/html.js';
import { icon, productCard, productTag } from '../ui.js';
import { shopLayout } from './layout.js';
import { parisNow } from '../../lib/time.js';

export function homePage(ctx, { categories, featured, zones, hours, state, shelf }) {
  const todayWd = parisNow().weekday;
  const minFee = zones.length ? Math.min(...zones.map((z) => z.fee_cents)) : 0;
  const minEta = zones.length ? Math.min(...zones.map((z) => z.eta_minutes)) : 45;

  const body = html`
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      <h1 class="display">Votre épicerie de quartier, <em>livrée</em> à votre porte.</h1>
      <p class="lede">Épicerie, cafés, douceurs, vins et CBD : tout ce qu'il faut pour le quotidien et l'apéro, livré dans tout Rouen par notre équipe.</p>
      <div class="hero-cta">
        <a class="btn btn-primary btn-lg" href="/boutique">Commander maintenant <span class="arrow">${icon('arrow')}</span></a>
        <a class="hero-link" href="#livraison">Voir les zones de livraison</a>
      </div>
      <div class="hero-meta">
        <span>${icon('clock')}${state.accepting ? html`Prochain créneau : ${state.nextSlot.dayLabel.toLowerCase()}, ${state.nextSlot.label}` : 'Commandes momentanément fermées'}</span>
        <span>${icon('bike')}Livraison dès ${money(minFee)}</span>
        <span>${icon('card')}Paiement par carte</span>
      </div>
    </div>
    <div class="shelf" aria-hidden="true">
      ${shelf.map((p) => productTag(p, { lazy: false }))}
    </div>
  </div>
</section>

<section class="section" id="rayons" aria-labelledby="rayons-title">
  <div class="wrap">
    <div class="section-head">
      <div><h2 class="h2" id="rayons-title">Les rayons</h2><p>Une sélection courte et soignée, renouvelée au fil des saisons.</p></div>
      <a class="link hide-sm" href="/boutique">Tout voir</a>
    </div>
    <div class="cat-rail">
      ${categories.map((c) => html`<a class="cat-tile tone-${c.tone}" href="/boutique?categorie=${c.slug}">
        <span class="cat-name">${c.name}</span>
        <span class="cat-count">${c.product_count} produit${c.product_count > 1 ? 's' : ''} ${icon('arrow')}</span>
      </a>`)}
    </div>
  </div>
</section>

<section class="section" aria-labelledby="pop-title">
  <div class="wrap">
    <div class="section-head">
      <div><h2 class="h2" id="pop-title">Les incontournables</h2><p>Ce que nos voisins commandent le plus souvent.</p></div>
      <a class="link" href="/boutique">Toute la boutique</a>
    </div>
    <div class="product-grid">${featured.map(productCard)}</div>
  </div>
</section>

<section class="section alt" aria-labelledby="how-title">
  <div class="wrap">
    <div class="section-head"><div><h2 class="h2" id="how-title">Comment ça marche</h2><p>Quatre étapes, et vos courses sont sur la table.</p></div></div>
    <div class="steps">
      <div class="step"><span class="step-n">01</span><h3>Composez votre panier</h3><p>Parcourez les rayons, ajoutez vos produits. Les prix et le stock sont à jour en temps réel.</p></div>
      <div class="step"><span class="step-n">02</span><h3>Choisissez un créneau</h3><p>Indiquez votre adresse et l'heure qui vous arrange, aujourd'hui ou dans les jours qui viennent.</p></div>
      <div class="step"><span class="step-n">03</span><h3>Nous préparons</h3><p>Votre commande est préparée à la main en boutique, produit par produit.</p></div>
      <div class="step"><span class="step-n">04</span><h3>On sonne chez vous</h3><p>Un livreur Maison Green vous apporte vos courses. Suivez-le en direct depuis votre téléphone.</p></div>
    </div>
  </div>
</section>

<section class="section" id="livraison" aria-labelledby="zones-title">
  <div class="wrap zones-grid">
    <div>
      <div class="section-head"><div><h2 class="h2" id="zones-title">Zones et délais</h2><p>Nous livrons Rouen et sa première couronne. Comptez environ ${minEta} minutes une fois votre créneau commencé.</p></div></div>
      <div class="zone-list">
        ${zones.map((z) => html`<div class="zone-row">
          <span class="zone-name">${z.name}</span><span class="zone-fee">${z.fee_cents ? money(z.fee_cents) : 'Offerte'}</span>
          <span class="zone-codes">${z.postal_codes.split(',').map((s) => s.trim()).join(' · ')}</span>
          <span class="zone-min">Sans minimum de commande${z.free_over_cents ? ` · offerte dès ${money(z.free_over_cents)}` : ''}</span>
        </div>`)}
      </div>
    </div>
    <div>
      <div class="checker">
        <h3 class="h3">Livrez-vous chez moi ?</h3>
        <p class="muted small mt-8">Saisissez votre code postal pour connaître vos frais de livraison.</p>
        <form data-zone-check action="/boutique" method="get">
          <label class="sr-only" for="zc">Code postal</label>
          <input class="input" id="zc" name="cp" inputmode="numeric" autocomplete="postal-code" maxlength="5" placeholder="76000" pattern="[0-9]{5}">
          <button class="btn btn-dark" type="submit">Vérifier</button>
        </form>
        <p class="checker-result" data-zone-result aria-live="polite"></p>
      </div>
      <div class="hours" aria-label="Horaires d'ouverture">
        ${hours.map((h) => html`<div class="${h.weekday === todayWd ? 'today' : ''}"><span>${h.day}</span><span class="${h.open ? '' : 'muted'}">${h.label}</span></div>`)}
      </div>
    </div>
  </div>
</section>

<section class="section" id="maison" aria-labelledby="perks-title">
  <div class="wrap">
    <div class="section-head"><div><h2 class="h2" id="perks-title">Pourquoi Maison Green</h2></div></div>
    <div class="perks">
      <div class="perk"><div class="rule"></div><h3>Choisi au comptoir</h3><p>Pas d'entrepôt : chaque produit vient de nos rayons, sélectionné auprès de producteurs et de maisons que nous connaissons.</p></div>
      <div class="perk"><div class="rule"></div><h3>Livré par nous</h3><p>Nos livreurs sont de l'équipe. Ils connaissent le quartier, les digicodes et le troisième étage sans ascenseur.</p></div>
      <div class="perk"><div class="rule"></div><h3>Paiement sécurisé</h3><p>Réglez par carte bancaire, en toute sécurité grâce à Stripe. Aucun abonnement, aucun frais caché.</p></div>
      <div class="perk"><div class="rule"></div><h3>Un vrai service de quartier</h3><p>Un produit manquant, une question ? On vous appelle avant de livrer. Et on reprend ce qui ne va pas.</p></div>
    </div>
  </div>
</section>`;
  return shopLayout(ctx, { body, state, active: '' });
}
