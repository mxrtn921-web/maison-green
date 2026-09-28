import { html, raw, money } from '../../lib/html.js';
import { icon, productCard, productTag, addControl } from '../ui.js';
import { shopLayout } from './layout.js';

export function catalogPage(ctx, { categories, products, q, category, state }) {
  const current = categories.find((c) => c.slug === category);
  const total = categories.reduce((s, c) => s + c.product_count, 0);
  const grouped = !q && !category;

  const results = !products.length
    ? html`<div class="empty"><h2 class="h2">Aucun produit trouvé</h2><p>${q ? `Rien ne correspond à « ${q} ». Essayez un autre mot, ou parcourez les rayons.` : 'Ce rayon est vide pour le moment.'}</p><a class="btn btn-ghost" href="/boutique">Voir tous les produits</a></div>`
    : grouped
      ? categories.map((c) => {
        const items = products.filter((p) => p.category_id === c.id);
        return items.length ? html`<section class="cat-block" id="${c.slug}"><h2 class="h2">${c.name}</h2><div class="product-grid">${items.map(productCard)}</div></section>` : '';
      })
      : html`<div class="cat-block">${q ? html`<p class="muted" style="margin-bottom:20px">${products.length} résultat${products.length > 1 ? 's' : ''} pour « ${q} »</p>` : ''}<div class="product-grid">${products.map(productCard)}</div></div>`;

  const body = html`
<div class="wrap shop-head">
  <h1 class="h1">${current ? current.name : 'La boutique'}</h1>
  ${current?.description ? html`<p class="muted mt-8">${current.description}</p>` : ''}
</div>
<div class="shop-tools">
  <div class="wrap">
    <form class="search" role="search" action="/boutique" method="get" data-search-form>
      ${icon('search')}
      <label class="sr-only" for="recherche">Rechercher un produit</label>
      <input class="input" id="recherche" type="search" name="q" value="${q}" placeholder="Rechercher : pommes, cidre, lessive…" autocomplete="off" enterkeyhint="search" data-live-search>
      ${category ? html`<input type="hidden" name="categorie" value="${category}">` : ''}
    </form>
    <nav class="chips" aria-label="Rayons">
      <a class="chip" href="/boutique${q ? `?q=${encodeURIComponent(q)}` : ''}" aria-current="${!category}">Tout <span class="n">${total}</span></a>
      ${categories.map((c) => html`<a class="chip" href="/boutique?categorie=${c.slug}${q ? `&q=${encodeURIComponent(q)}` : ''}" aria-current="${category === c.slug}">${c.name} <span class="n">${c.product_count}</span></a>`)}
    </nav>
  </div>
</div>
<div class="wrap" style="padding-bottom:72px" data-results>${results}</div>`;
  return shopLayout(ctx, { title: current ? current.name : 'Boutique', body, state, active: 'shop' });
}

export function productPage(ctx, { product: p, related, state }) {
  const soldOut = p.stock <= 0;
  const body = html`
<div class="wrap">
  <div class="pdp">
    <div>${productTag(p, { lazy: false })}</div>
    <div class="pdp-info">
      <nav class="crumbs" aria-label="Fil d'Ariane"><a href="/boutique">Boutique</a><span>/</span><a href="/boutique?categorie=${p.category_slug}">${p.category_name}</a></nav>
      <h1 class="h1">${p.name}</h1>
      <div class="row between wrap-row">
        <span class="pdp-price">${money(p.price_cents)}</span>
        <span class="muted">${p.unit}</span>
      </div>
      ${p.description ? html`<p class="lede" style="font-size:16px">${p.description}</p>` : ''}
      <div class="pdp-actions">
        ${soldOut ? html`<span class="badge b-cancelled plain">Épuisé pour le moment</span>` : addControl(p, true)}
        ${!soldOut && p.stock <= 5 ? html`<span class="small" style="color:var(--warn)">Plus que ${p.stock} en stock</span>` : ''}
      </div>
      <dl class="facts">
        ${p.origin ? html`<div><dt>Origine</dt><dd>${p.origin}</dd></div>` : ''}
        <div><dt>Format</dt><dd>${p.unit}</dd></div>
        <div><dt>Rayon</dt><dd>${p.category_name}</dd></div>
        <div><dt>Livraison</dt><dd>${state.accepting ? `Dès ${state.nextSlot.dayLabel.toLowerCase()}, ${state.nextSlot.label}` : 'Commandes fermées'}</dd></div>
      </dl>
    </div>
  </div>
  ${related.length ? html`<section class="section" style="padding-top:0"><div class="section-head"><h2 class="h2">Dans le même rayon</h2></div><div class="product-grid">${related.map(productCard)}</div></section>` : ''}
</div>`;
  return shopLayout(ctx, { title: p.name, description: `${p.name} — ${p.unit}. ${p.description}`.slice(0, 160), body, state, active: 'shop' });
}

export { raw };
