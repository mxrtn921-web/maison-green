import { html, money } from '../../lib/html.js';
import { icon, productCard, productTag } from '../ui.js';
import { shopLayout } from './layout.js';
import { parisNow } from '../../lib/time.js';

/** Titre géant : chaque lettre monte à son tour (0,05 s d'écart). */
const bigWord = (lines) => {
  let i = 0;
  return lines.map((word) => html`<span class="hl">${[...word].map((ch) => html`<span class="ch" style="--i:${i++}">${ch}</span>`)}</span>`);
};

export function homePage(ctx, { categories, featured, zones, hours, state, shelf }) {
  const todayWd = parisNow().weekday;
  const minFee = zones.length ? Math.min(...zones.map((z) => z.fee_cents)) : 0;
  const minEta = zones.length ? Math.min(...zones.map((z) => z.eta_minutes)) : 45;
  const showSignupOffer = !ctx.user || ctx.user.role !== 'customer';
  const floats = shelf.filter((p) => p.image_url).slice(0, 3);
  const ticker = ['Snacks', 'Boissons', 'CBD', 'Alcool', 'Épicerie', 'Livré tous les soirs', 'Rouen', 'Jusqu’à 2h'];

  const body = html`
<section class="sg-hero" aria-labelledby="hero-title">
  ${floats.map((p, i) => html`<div class="sg-float f${i + 1}" data-parallax aria-hidden="true">${productTag(p, { lazy: false })}</div>`)}
  <span class="sg-sticker s1" aria-hidden="true">Livré jusqu’à 2h</span>
  ${showSignupOffer ? html`<a class="sg-sticker s2" href="/inscription">1re livraison offerte</a>` : html`<span class="sg-sticker s2" aria-hidden="true">Rouen ✦ 76</span>`}
  <h1 class="sg-hero-title" id="hero-title" aria-label="Maison Green">${bigWord(['Maison', 'Green'])}</h1>
  <div class="wrap sg-hero-foot">
    <div>
      <span class="kicker">Le shop de nuit — Rouen</span>
      <p>Snacks du monde, boissons fraîches, CBD et l’essentiel de l’épicerie. Tu commandes, on prépare au comptoir et on te livre le soir même.</p>
    </div>
    <div class="sg-hero-meta">
      <span class="sg-pill">${icon('clock')}${state.accepting ? html`${state.nextSlot.dayLabel} · ${state.nextSlot.label}` : 'Fermé pour le moment'}</span>
      <span class="sg-pill">${icon('bike')}Livraison dès ${money(minFee)}</span>
      <span class="sg-pill">${icon('card')}Paiement CB</span>
    </div>
    <div class="sg-hero-cta">
      <a class="btn btn-primary btn-lg" href="/boutique">Commander ${icon('arrow')}</a>
    </div>
  </div>
</section>

<div class="sg-ticker" aria-hidden="true"><div class="sg-ticker-track">${[...ticker, ...ticker, ...ticker, ...ticker].map((t) => html`<span>${t}</span>`)}</div></div>

<section class="sg-block olive first" aria-labelledby="pop-title">
  <div class="wrap">
    <div class="sg-head sg-reveal">
      <h2 class="sg-big" id="pop-title">La sélec’</h2>
      <a class="sg-round" href="/boutique">Tout voir ${icon('arrow')}</a>
    </div>
    <div class="product-grid sg-grid sg-reveal">${featured.map(productCard)}</div>
  </div>
</section>

<section class="sg-block cream" id="rayons" aria-labelledby="rayons-title">
  <div class="wrap">
    <div class="sg-head sg-reveal"><h2 class="sg-big" id="rayons-title">Les rayons</h2></div>
    <div class="sg-cats sg-reveal">
      ${categories.map((c) => html`<a class="sg-cat" href="/boutique?categorie=${c.slug}">${c.name}<small>${c.product_count}</small></a>`)}
    </div>
  </div>
</section>

<section class="sg-block sage" aria-labelledby="how-title">
  <div class="wrap">
    <div class="sg-head sg-reveal"><h2 class="sg-big" id="how-title">Comment ça marche</h2></div>
    <div class="sg-steps sg-reveal">
      <div class="sg-step"><span class="sg-step-n">01</span><h3>Tu remplis ton panier</h3><p>Prix et stock à jour en direct, comme au comptoir.</p></div>
      <div class="sg-step"><span class="sg-step-n">02</span><h3>Tu choisis ton créneau</h3><p>Ce soir ou un autre jour, à l’heure qui t’arrange.</p></div>
      <div class="sg-step"><span class="sg-step-n">03</span><h3>On prépare</h3><p>Ta commande est faite à la main au shop, produit par produit.</p></div>
      <div class="sg-step"><span class="sg-step-n">04</span><h3>On sonne</h3><p>Un livreur de l’équipe te l’apporte. Tu le suis en direct sur ton téléphone.</p></div>
    </div>
  </div>
</section>

<section class="sg-block forest" id="livraison" aria-labelledby="zones-title">
  <div class="wrap">
    <div class="sg-head sg-reveal"><h2 class="sg-big" id="zones-title" style="color:var(--cream)">On livre où ?</h2></div>
    <div class="zones-grid sg-reveal">
      <div>
        <p style="margin-bottom:22px">Rouen et la première couronne. Compte environ ${minEta} minutes une fois ton créneau commencé.</p>
        <div class="zone-list">
          ${zones.map((z) => html`<div class="zone-row">
            <span class="zone-name">${z.name}</span><span class="zone-fee">${z.fee_cents ? money(z.fee_cents) : 'Offerte'}</span>
            <span class="zone-codes">${z.postal_codes.split(',').map((s) => s.trim()).join(' · ')}</span>
            <span class="zone-min">Sans minimum${z.free_over_cents ? ` · offerte dès ${money(z.free_over_cents)}` : ''}</span>
          </div>`)}
        </div>
      </div>
      <div>
        <div class="checker">
          <h3 class="h3">Tu es dans la zone ?</h3>
          <p class="small mt-8">Tape ton code postal pour voir les frais de livraison.</p>
          <form data-zone-check action="/boutique" method="get">
            <label class="sr-only" for="zc">Code postal</label>
            <input class="input" id="zc" name="cp" inputmode="numeric" autocomplete="postal-code" maxlength="5" placeholder="76000" pattern="[0-9]{5}">
            <button class="btn btn-dark" type="submit">Vérifier</button>
          </form>
          <p class="checker-result" data-zone-result aria-live="polite"></p>
        </div>
        <div class="hours" aria-label="Horaires d'ouverture">
          ${hours.map((h) => html`<div class="${h.weekday === todayWd ? 'today' : ''}"><span>${h.day}</span><span>${h.label}</span></div>`)}
        </div>
      </div>
    </div>
  </div>
</section>

<section class="sg-block cream" id="maison" aria-labelledby="perks-title">
  <div class="wrap">
    <div class="sg-head sg-reveal"><h2 class="sg-big" id="perks-title">Pourquoi nous</h2></div>
    <div class="sg-perks sg-reveal">
      <div class="sg-perk"><h3>Choisi au comptoir</h3><p>Pas d’entrepôt : tout vient de nos rayons, des snacks importés aux fleurs de CBD.</p></div>
      <div class="sg-perk"><h3>Livré par l’équipe</h3><p>Nos livreurs connaissent le quartier, les digicodes et le 3e sans ascenseur.</p></div>
      <div class="sg-perk"><h3>Paiement sécurisé</h3><p>Carte bancaire via Stripe. Pas d’abonnement, pas de frais cachés.</p></div>
      <div class="sg-perk"><h3>Un vrai shop de quartier</h3><p>Un produit manque ? On t’appelle avant de partir. Et on reprend ce qui ne va pas.</p></div>
    </div>
  </div>
</section>`;
  return shopLayout(ctx, { body, state, active: '' });
}
