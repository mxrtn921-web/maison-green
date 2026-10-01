// Routes côté client : pages boutique, commande, suivi, API panier.
import { get, post } from '../router.js';
import { sendHtml, sendJson, redirect, setFlash, HttpError, clientIp, isBot } from '../lib/http.js';
import { rateLimit } from '../auth.js';
import { subscribe } from '../lib/events.js';
import { all } from '../db.js';
import { categories as rawCategories, shopProducts as rawShopProducts, featuredProducts, productBySlug, quoteCart, groupVariants, siblingsOf, baseName, norm } from '../services/catalog.js';

// Boutique : les variantes (« Amnesia — 1 g / 5 g / 10 g ») sont regroupées en une seule fiche, et les compteurs de rayon suivent.
const shopProducts = (opts) => groupVariants(rawShopProducts(opts));
const categories = (opts = {}) => {
  const cats = rawCategories(opts);
  if (!opts.withCounts) return cats;
  const n = new Map(); for (const p of shopProducts()) n.set(p.category_id, (n.get(p.category_id) || 0) + 1);
  return cats.map((c) => ({ ...c, product_count: n.get(c.id) || 0 }));
};
import { zones, zoneForPostal, deliveryFee, availableSlots, orderingState, hoursSummary } from '../services/delivery.js';
import { createOrder, getOrderByToken, orderItems, orderEvents, markPaid, markPaymentFailed } from '../services/orders.js';
import { startCheckout, confirmCheckoutSession, verifyWebhook, handleWebhookEvent } from '../services/payments.js';
import { homePage } from '../views/shop/home.js';
import { catalogPage, productPage } from '../views/shop/catalog.js';
import { checkoutPage, demoPaymentPage } from '../views/shop/checkout.js';
import { trackPage } from '../views/shop/track.js';
import { stripeEnabled, config } from '../config.js';
import { send } from '../lib/http.js';
import { money } from '../lib/html.js';

// ——— Référencement : robots.txt et plan du site (sitemap.xml) ————————————————
get('/robots.txt', (ctx) => send(ctx.res, 200, ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /livreur', 'Disallow: /compte', 'Disallow: /suivi',
  'Disallow: /commande', 'Disallow: /paiement-demo', 'Disallow: /api', '', `Sitemap: ${config.baseUrl}/sitemap.xml`, ''].join('\n'), 'text/plain; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' }));
get('/sitemap.xml', (ctx) => {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [['/', 'daily', '1.0'], ['/boutique', 'daily', '0.9'],
    ...categories({ withCounts: true }).filter((c) => c.product_count > 0).map((c) => [`/boutique?categorie=${encodeURIComponent(c.slug)}`, 'weekly', '0.7']),
    ...shopProducts().map((p) => [`/produit/${encodeURIComponent(p.slug)}`, 'weekly', '0.6']),
    ['/cgv', 'yearly', '0.2'], ['/cgu', 'yearly', '0.2'], ['/confidentialite', 'yearly', '0.2'], ['/mentions-legales', 'yearly', '0.2']];
  const xmlEsc = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, f, pr]) => `  <url><loc>${xmlEsc(config.baseUrl + u)}</loc><lastmod>${today}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}\n</urlset>\n`;
  send(ctx.res, 200, body, 'application/xml; charset=utf-8', { 'Cache-Control': 'public, max-age=3600' });
});

get('/', (ctx) => {
  const cats = categories({ withCounts: true }).filter((c) => c.product_count > 0);
  const featured = groupVariants(featuredProducts(24)).slice(0, 8);
  // Étagère de l'accueil : un produit par rayon, pour montrer la palette d'étiquettes.
  // Vitrine de l'accueil : un produit par rayon (de préférence avec photo), complétée jusqu'à 6 cases pour garder une grille pleine.
  const pick = (list) => list.find((p) => p.is_featured && p.image_url) || list.find((p) => p.image_url) || list[0];
  const shelfRaw = cats.slice(0, 6).map((c) => pick(shopProducts({ category: c.slug }))).filter(Boolean);
  if (shelfRaw.length < 6) {
    const taken = new Set(shelfRaw.map((p) => p.id));
    for (const p of shopProducts({}).filter((x) => x.image_url && !taken.has(x.id))) { if (shelfRaw.length >= 6) break; shelfRaw.push(p); }
  }
  const shelf = shelfRaw.slice(0, 6).map((p) => (p.group_name ? { ...p, name: p.group_name, unit: `${p.variant_count} formats` } : p));
  sendHtml(ctx.res, homePage(ctx, { categories: cats, featured, zones: zones(), hours: hoursSummary(), state: orderingState(), shelf }));
});

get('/boutique', (ctx) => {
  const q = String(ctx.query.get('q') || '').slice(0, 80);
  const category = String(ctx.query.get('categorie') || '').slice(0, 80);
  const cats = categories({ withCounts: true }).filter((c) => c.product_count > 0);
  sendHtml(ctx.res, catalogPage(ctx, { categories: cats, products: shopProducts({ q, category }), q, category, state: orderingState() }));
});

get('/produit/:slug', (ctx) => {
  const p = productBySlug(ctx.params.slug);
  if (!p) throw new HttpError(404, 'Ce produit n’existe pas ou n’est plus disponible.');
  const related = shopProducts({ category: p.category_slug }).filter((x) => norm(baseName(x.name)) !== norm(baseName(p.name))).slice(0, 4);
  sendHtml(ctx.res, productPage(ctx, { product: p, related, state: orderingState(), variants: siblingsOf(p) }));
});

get('/commande', (ctx) => {
  const addresses = ctx.user ? all('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC', ctx.user.id) : [];
  sendHtml(ctx.res, checkoutPage(ctx, { days: availableSlots(), zones: zones(), addresses, state: orderingState() }));
});

// ——— API panier / zones ———————————————————————————————————————

post('/api/cart/quote', (ctx) => {
  const quote = quoteCart(ctx.body.items);
  const zone = ctx.body.postal_code ? zoneForPostal(ctx.body.postal_code) : null;
  const zs = zones();
  sendJson(ctx.res, {
    ...quote,
    zone: zone ? { name: zone.name, fee: deliveryFee(zone, quote.subtotal), min: 0, free_over: zone.free_over_cents } : null,
    min_fee: zs.length ? Math.min(...zs.map((z) => z.fee_cents)) : 0,
    min_order: 0,
  });
});

get('/api/zone', (ctx) => {
  const z = zoneForPostal(ctx.query.get('cp'));
  sendJson(ctx.res, z ? { ok: true, name: z.name, fee: z.fee_cents, fee_label: z.fee_cents ? money(z.fee_cents) : 'offerte', min: 0, eta: z.eta_minutes, free_over: z.free_over_cents }
    : { ok: false });
});

post('/api/orders', async (ctx) => {
  // Anti-spam : champ piège rempli (robot) ou trop de commandes depuis la même connexion.
  if (isBot(ctx.body)) return sendJson(ctx.res, { message: 'Commande refusée.', errors: {} }, 422);
  rateLimit(`order:${clientIp(ctx.req)}`, 30, 10 * 60e3);
  try {
    const { order } = createOrder(ctx.body, ctx.user?.role === 'customer' ? ctx.user : null);
    try {
      const url = await startCheckout(order, ctx.user?.role === 'customer' ? ctx.user : null);
      return sendJson(ctx.res, { redirect: url }, 201);
    } catch (e) {
      markPaymentFailed(order.id, 'Service de paiement indisponible');
      return sendJson(ctx.res, { redirect: `/suivi/${order.tracking_token}` }, 201);
    }
  } catch (e) {
    if (e instanceof HttpError && [409, 422].includes(e.status)) return sendJson(ctx.res, { message: e.message, errors: e.errors || {} }, e.status);
    throw e;
  }
});

// ——— Paiement ———————————————————————————————————————————————

get('/commande/retour', async (ctx) => {
  const order = await confirmCheckoutSession(ctx.query.get('session_id') || '');
  redirect(ctx.res, `/suivi/${order.tracking_token}?paye=1`);
});

post('/suivi/:token/payer', async (ctx) => {
  const o = getOrderByToken(ctx.params.token);
  if (!o) throw new HttpError(404);
  if (o.status !== 'awaiting_payment') return redirect(ctx.res, `/suivi/${o.tracking_token}`);
  try { redirect(ctx.res, await startCheckout(o, ctx.user?.role === 'customer' ? ctx.user : null)); }
  catch (e) { setFlash(ctx.res, 'error', `Paiement indisponible : ${e.message}`); redirect(ctx.res, `/suivi/${o.tracking_token}`); }
});

post('/suivi/:token/especes', (ctx) => {
  const o = getOrderByToken(ctx.params.token);
  if (!o) throw new HttpError(404);
  setFlash(ctx.res, 'error', 'Le paiement se fait uniquement par carte bancaire.');
  redirect(ctx.res, `/suivi/${o.tracking_token}`);
});

get('/paiement-demo/:token', (ctx) => {
  if (stripeEnabled()) throw new HttpError(404);
  const o = getOrderByToken(ctx.params.token);
  if (!o || o.status !== 'awaiting_payment') throw new HttpError(404);
  sendHtml(ctx.res, demoPaymentPage(ctx, { order: o }));
});
post('/paiement-demo/:token', (ctx) => {
  if (stripeEnabled()) throw new HttpError(404);
  const o = getOrderByToken(ctx.params.token);
  if (!o) throw new HttpError(404);
  if (ctx.body.result === 'success') { markPaid(o.id, { provider: 'demo' }); redirect(ctx.res, `/suivi/${o.tracking_token}?paye=1`); }
  else { markPaymentFailed(o.id, 'Carte refusée (simulation)'); redirect(ctx.res, `/suivi/${o.tracking_token}`); }
});

post('/api/stripe/webhook', (ctx) => {
  const event = verifyWebhook(ctx.rawBody, ctx.req.headers['stripe-signature']);
  handleWebhookEvent(event);
  sendJson(ctx.res, { received: true });
});

// ——— Suivi ——————————————————————————————————————————————————

get('/suivi/:token', (ctx) => {
  const o = getOrderByToken(ctx.params.token);
  if (!o) throw new HttpError(404, 'Ce lien de suivi est invalide.');
  sendHtml(ctx.res, trackPage(ctx, { order: o, items: orderItems(o.id), events: orderEvents(o.id), justPaid: ctx.query.has('paye'), paymentCancelled: ctx.query.get('paiement') === 'annule' }));
});

get('/api/suivi/:token/events', (ctx) => {
  const o = getOrderByToken(ctx.params.token);
  if (!o) throw new HttpError(404);
  subscribe(ctx.req, ctx.res, [`order:${o.tracking_token}`]);
});
