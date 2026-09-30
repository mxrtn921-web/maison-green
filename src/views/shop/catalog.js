import { html, raw, money } from '../../lib/html.js';
import { icon, productCard, productTag, addControl } from '../ui.js';
import { shopLayout } from './layout.js';
import { baseName, variantLabel } from '../../services/catalog.js';

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
  ${current && (current.age_restricted || current.legal_notice) ? html`<p class="legal-note mt-8">${icon('shield')}<span>${current.age_restricted ? 'Vente interdite aux mineurs. ' : ''}${current.legal_notice}</span></p>` : ''}
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

export function productPage(ctx, { product: p, related, state, variants = [] }) {
  const soldOut = p.stock <= 0;
  const multi = variants.length > 1;
  const title = multi ? baseName(p.name) : p.name;
  const body = html`
<div class="wrap">
  <div class="pdp">
    <div>${productTag(multi ? { ...p, name: title, unit: variantLabel(p) } : p, { lazy: false })}</div>
    <div class="pdp-info">
      <nav class="crumbs" aria-label="Fil d'Ariane"><a href="/boutique">Boutique</a><span>/</span><a href="/boutique?categorie=${p.category_slug}">${p.category_name}</a></nav>
      <h1 class="h1">${title}</h1>
      <div class="row between wrap-row">
        <span class="pdp-price">${money(p.price_cents)}</span>
        <span class="muted">${p.unit}</span>
      </div>
      ${multi ? html`<div class="variants" role="radiogroup" aria-label="Format">
        <span class="variants-label">Format</span>
        <div class="variants-list">${variants.map((v) => html`<a class="variant ${v.stock <= 0 ? 'out' : ''}" href="/produit/${v.slug}" role="radio" aria-checked="${v.id === p.id}" ${raw(v.id === p.id ? 'aria-current="true"' : '')}>
          <span class="v-label">${variantLabel(v)}</span><span class="v-price">${money(v.price_cents)}</span>${v.stock <= 0 ? html`<span class="v-out">épuisé</span>` : ''}</a>`)}</div>
      </div>` : ''}
      ${p.description ? html`<p class="lede" style="font-size:16px">${p.description}</p>` : ''}
      ${p.age_restricted ? html`<p class="legal-note">${icon('shield')}<span>Vente interdite aux mineurs. Pièce d'identité demandée à la livraison.${p.legal_notice ? ` ${p.legal_notice}` : ''}</span></p>` : (p.legal_notice ? html`<p class="legal-note">${icon('info')}<span>${p.legal_notice}</span></p>` : '')}
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
  return shopLayout(ctx, { title, description: `${title} — ${multi ? variants.map(variantLabel).join(', ') : p.unit}. ${p.description}`.slice(0, 160), body, state, active: 'shop' });
}

export { raw };
