import { html, raw, money } from '../../lib/html.js';
import { icon } from '../ui.js';
import { shopLayout } from './layout.js';
import { stripeEnabled } from '../../config.js';

const json = (v) => raw(JSON.stringify(v).replace(/</g, '\\u003c'));

export function checkoutPage(ctx, { days, zones, addresses, state }) {
  const u = ctx.user && ctx.user.role === 'customer' ? ctx.user : null;
  const def = addresses.find((a) => a.is_default) || addresses[0] || {};
  const zoneData = zones.map((z) => ({ name: z.name, codes: z.postal_codes.split(/[\s,;]+/), fee: z.fee_cents, min: z.min_order_cents, free: z.free_over_cents, eta: z.eta_minutes }));

  const body = html`
<div class="wrap">
  <div class="co-head">
        <h1 class="h1">Finaliser la commande</h1>
        ${!ctx.user ? html`<a class="link small" href="/connexion?suite=/commande">J'ai déjà un compte</a>` : ''}
      </div>
  <div class="checkout" data-checkout>
    <form class="co-form" data-checkout-form novalidate>

      ${!state.accepting ? html`<div class="notice notice-warn mt-16">${icon('info')}<span>${state.message}</span></div>` : ''}
      <div class="notice notice-error mt-16" data-form-error role="alert" hidden></div>

      <section class="co-section" aria-labelledby="s1">
        <div class="co-title"><span class="n">1</span><h2 id="s1">Vos coordonnées</h2></div>
        <div class="grid-2">
          <div class="field"><label for="first_name">Prénom</label><input class="input" id="first_name" name="first_name" autocomplete="given-name" required value="${u?.first_name || ''}"></div>
          <div class="field"><label for="last_name">Nom</label><input class="input" id="last_name" name="last_name" autocomplete="family-name" required value="${u?.last_name || ''}"></div>
          <div class="field"><label for="phone">Téléphone</label><input class="input" id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required value="${u?.phone || ''}" placeholder="06 12 34 56 78"><span class="hint">Pour que le livreur puisse vous prévenir.</span></div>
          <div class="field"><label for="email">E-mail</label><input class="input" id="email" name="email" type="email" inputmode="email" autocomplete="email" required value="${u?.email || ''}"><span class="hint">Pour la confirmation et le lien de suivi.</span></div>
        </div>
      </section>

      <section class="co-section" aria-labelledby="s2">
        <div class="co-title"><span class="n">2</span><h2 id="s2">Adresse de livraison</h2></div>
        ${addresses.length ? html`<div class="saved-addr" role="group" aria-label="Adresses enregistrées">
          ${addresses.map((a) => html`<button type="button" data-address='${JSON.stringify({ address_line1: a.line1, address_line2: a.line2, postal_code: a.postal_code, city: a.city, instructions: a.instructions })}' aria-pressed="${a.id === def.id}"><strong>${a.label}</strong>${a.line1}, ${a.city}</button>`)}
        </div>` : ''}
        <div class="grid-2">
          <div class="field span-2"><label for="address_line1">Adresse</label><input class="input" id="address_line1" name="address_line1" autocomplete="address-line1" required value="${def.line1 || ''}" placeholder="12 rue Jeanne d'Arc"></div>
          <div class="field span-2"><label for="address_line2">Complément <span class="muted" style="font-weight:400">(facultatif)</span></label><input class="input" id="address_line2" name="address_line2" autocomplete="address-line2" value="${def.line2 || ''}" placeholder="Bâtiment, étage, code d'accès"></div>
          <div class="field"><label for="postal_code">Code postal</label><input class="input" id="postal_code" name="postal_code" inputmode="numeric" autocomplete="postal-code" maxlength="5" required value="${def.postal_code || ''}" data-postal><p class="zone-hint" data-zone-hint aria-live="polite"></p></div>
          <div class="field"><label for="city">Ville</label><input class="input" id="city" name="city" autocomplete="address-level2" required value="${def.city || 'Rouen'}"></div>
          <div class="field span-2"><label for="instructions">Instructions pour le livreur <span class="muted" style="font-weight:400">(facultatif)</span></label><textarea class="textarea" id="instructions" name="instructions" maxlength="300" placeholder="Sonner chez Dupont · Appartement 24, 3e étage · Déposer devant la porte">${def.instructions || ''}</textarea></div>
          ${u ? html`<label class="check span-2"><input type="checkbox" name="save_address" ${raw(addresses.length ? '' : 'checked')}> Enregistrer cette adresse dans mon compte</label>` : ''}
        </div>
      </section>

      <section class="co-section" aria-labelledby="s3">
        <div class="co-title"><span class="n">3</span><h2 id="s3">Créneau de livraison</h2></div>
        ${days.length ? html`
        <div class="days" role="group" aria-label="Jour de livraison">
          ${days.map((d, i) => html`<button type="button" class="day-btn" data-day="${d.date}" aria-pressed="${i === 0}"><span class="d">${d.label}</span><span class="s">${d.slots.filter((s) => s.remaining > 0).length} créneau${d.slots.filter((s) => s.remaining > 0).length > 1 ? 'x' : ''}</span></button>`)}
        </div>
        ${days.map((d, i) => html`<div class="slots" data-slots-for="${d.date}" ${raw(i === 0 ? '' : 'hidden')} role="radiogroup" aria-label="Créneaux du ${d.label}">
          ${d.slots.map((s) => html`<div class="slot"><input type="radio" name="slot" id="slot-${d.date}-${s.start}" value="${d.date}|${s.start}" ${raw(s.remaining ? '' : 'disabled')}><label for="slot-${d.date}-${s.start}"><span class="t">${s.label}</span><span class="r">${s.remaining ? (s.remaining <= 2 ? `Plus que ${s.remaining} place${s.remaining > 1 ? 's' : ''}` : 'Disponible') : 'Complet'}</span></label></div>`)}
        </div>`)}` : html`<div class="notice notice-warn">${icon('info')}<span>Aucun créneau disponible pour le moment.</span></div>`}
        <p class="error-text mt-8" data-err="slot" hidden></p>
      </section>

      <section class="co-section" aria-labelledby="s4">
        <div class="co-title"><span class="n">4</span><h2 id="s4">Paiement</h2></div>
        <div class="pay-options" role="radiogroup" aria-label="Mode de paiement">
          <div class="pay"><input type="radio" name="payment_method" id="pm-card" value="card" checked><label for="pm-card"><span class="t">Carte bancaire</span><span class="brands"><span>CB</span><span>VISA</span><span>MC</span></span><span class="d">Paiement sécurisé sur la page Stripe. Vos données bancaires ne sont jamais stockées par Maison Green.${stripeEnabled() ? '' : ' (Mode démo : aucun débit réel)'}</span></label></div>
        </div>
        <label class="check mt-24"><input type="checkbox" name="accept_terms" required> <span>J'accepte les <a class="link" href="/cgv" target="_blank">conditions générales de vente</a> et la <a class="link" href="/confidentialite" target="_blank">politique de confidentialité</a>.</span></label>
        <p class="error-text mt-8" data-err="accept_terms" hidden></p>
      </section>

      <div class="mobile-pay">
        <button class="btn btn-primary btn-lg btn-block" type="submit" data-submit ${raw(state.accepting ? '' : 'disabled')}><span data-submit-label>Valider la commande</span></button>
        <p class="small muted mt-8" style="text-align:center">${icon('shield')} Paiement chiffré · aucune carte enregistrée chez nous</p>
      </div>
    </form>

    <aside class="summary" aria-labelledby="sum-title">
      <details class="sum-details" data-sum-details open>
        <summary><h2 class="h3" id="sum-title">Récapitulatif</h2><span class="sum-peek" data-sum-peek></span></summary>
        <div data-summary-lines class="mt-8"></div>
        <button class="btn btn-quiet btn-sm mt-8" type="button" data-open-cart>Modifier le panier</button>
      </details>
      <div class="totals mt-16" data-summary-totals></div>
      <p class="error-text mt-8" data-err="cart" hidden></p>
    </aside>
  </div>
</div>
<script type="application/json" id="checkout-data">${json({ zones: zoneData })}</script>`;
  return shopLayout(ctx, { title: 'Commande', body, state, robots: 'noindex', hideCartBar: true });
}

export function demoPaymentPage(ctx, { order }) {
  const body = html`<div class="wrap wrap-narrow" style="padding:56px var(--gutter) 96px">
    <div class="notice notice-warn">${icon('info')}<span><strong>Mode démo.</strong> Stripe n'est pas encore configuré (clé <code>STRIPE_SECRET_KEY</code> absente). Aucune carte n'est demandée ni débitée : choisissez l'issue du paiement pour tester le parcours.</span></div>
    <div class="panel mt-24"><div class="panel-body stack" style="--s:14px">
      <h1 class="h2">Paiement de la commande ${order.number}</h1>
      <p class="muted">Montant : <strong style="color:var(--ink)" class="price">${money(order.total_cents)}</strong></p>
      <form method="post" action="/paiement-demo/${order.tracking_token}" class="row wrap-row">
        <button class="btn btn-primary" name="result" value="success">${icon('check')} Simuler un paiement réussi</button>
        <button class="btn btn-danger" name="result" value="failure">${icon('x')} Simuler un refus</button>
      </form>
    </div></div>
  </div>`;
  return shopLayout(ctx, { title: 'Paiement (démo)', body, robots: 'noindex', hideCartBar: true });
}
