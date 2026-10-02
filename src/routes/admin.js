// Back-office Maison Green (rôle « admin » obligatoire sur chaque route).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { get, post } from '../router.js';
import { send, sendHtml, sendJson, redirect, setFlash, HttpError } from '../lib/http.js';
import { subscribe } from '../lib/events.js';
import { one, all, run, tx, nowIso, getSetting, setSetting, backupTo } from '../db.js';
import os from 'node:os';
import * as Push from '../services/push.js';
import { validate, v, slugify } from '../lib/validate.js';
import { requireRole, hashPassword, revokeAllSessions } from '../auth.js';
import { config } from '../config.js';
import { money } from '../lib/html.js';
import { parisNow, addDays, parisToUtc, dayLabel, shortDate, weekdayOf, WEEKDAYS } from '../lib/time.js';
import { categories as listCategories, adminProducts, productById } from '../services/catalog.js';
import { orderingState } from '../services/delivery.js';
import { getOrder, orderItems, orderEvents, setStatus, assignDriver, drivers as listDrivers, remitCash, ACTIVE } from '../services/orders.js';
import { refundPayment, paymentsFor } from '../services/payments.js';
import { notify, notificationsFor, markAllRead } from '../services/notify.js';
import * as CatalogImport from '../services/catalog-import.js';
import { shopInfo } from '../lib/shop.js';
import { years as reportYears, yearReport, yearOrders } from '../services/reports.js';
import * as V from '../views/admin/pages.js';
import * as Analytics from '../services/analytics.js';

const admin = (ctx) => requireRole(ctx, 'admin');
const ORDER_SELECT = `SELECT o.*, d.first_name AS driver_first_name FROM orders o LEFT JOIN users d ON d.id = o.driver_id`;

// ——— Tableau de bord ——————————————————————————————————————————

get('/admin', (ctx) => {
  admin(ctx);
  const now = parisNow();
  const startOf = (date) => parisToUtc(date, '00:00').toISOString();
  const today = startOf(now.date);
  const d30 = startOf(addDays(now.date, -29));
  const VALID = "status NOT IN ('cancelled','awaiting_payment')";
  const sum = (from) => one(`SELECT COALESCE(SUM(total_cents),0) AS revenue, COUNT(*) AS count FROM orders WHERE ${VALID} AND created_at >= ?`, from);
  const series = [];
  for (let i = 13; i >= 0; i--) {
    const date = addDays(now.date, -i);
    const r = one(`SELECT COALESCE(SUM(total_cents),0) AS total, COUNT(*) AS count FROM orders WHERE ${VALID} AND created_at >= ? AND created_at < ?`, startOf(date), startOf(addDays(date, 1)));
    series.push({ date, total: r.total, count: r.count, label: dayLabel(date, now.date), short: i === 0 ? 'Auj.' : `${WEEKDAYS[weekdayOf(date)].slice(0, 2)} ${Number(date.slice(8))}` });
  }
  const stats = {
    state: orderingState(),
    todayLabel: `${WEEKDAYS[now.weekday]} ${shortDate(now.date)}`,
    backupDue: (() => { const last = getSetting('last_backup_at', null); return one('SELECT COUNT(*) AS n FROM orders').n > 0 && (!last || Date.now() - Date.parse(last) > 30 * 86400e3); })(),
    today: sum(today), d30: sum(d30), series,
    active: one(`SELECT COUNT(*) AS n FROM orders WHERE status IN (${ACTIVE.map(() => '?').join(',')})`, ...ACTIVE).n,
    toConfirm: one("SELECT COUNT(*) AS n FROM orders WHERE status = 'received'").n,
    deliveredToday: one("SELECT COUNT(*) AS n FROM orders WHERE status = 'delivered' AND delivered_at >= ?", today).n,
    cancelled30: one("SELECT COUNT(*) AS n FROM orders WHERE status = 'cancelled' AND created_at >= ?", d30).n,
    cashDue: one("SELECT COALESCE(SUM(cash_to_collect_cents),0) AS n FROM orders WHERE payment_method = 'cash' AND payment_status = 'due_on_delivery' AND status NOT IN ('cancelled')").n,
    cashHeld: one('SELECT COALESCE(SUM(cash_to_collect_cents),0) AS n FROM orders WHERE cash_collected_at IS NOT NULL AND cash_remitted_at IS NULL').n,
    pay: {
      ...one(`SELECT COALESCE(SUM(CASE WHEN payment_method='card' AND payment_status IN ('paid','partially_refunded') THEN total_cents END),0) AS card,
                     COUNT(CASE WHEN payment_method='card' AND payment_status IN ('paid','partially_refunded') THEN 1 END) AS cardCount,
                     COALESCE(SUM(CASE WHEN payment_method='cash' AND payment_status='paid' THEN total_cents END),0) AS cash,
                     COUNT(CASE WHEN payment_method='cash' AND payment_status='paid' THEN 1 END) AS cashCount,
                     COUNT(CASE WHEN payment_status='failed' THEN 1 END) AS failed
              FROM orders WHERE created_at >= ?`, d30),
      refunded: one('SELECT COALESCE(SUM(refunded_cents),0) AS n FROM payments WHERE created_at >= ?', d30).n,
    },
    top: all(`SELECT oi.name, SUM(oi.quantity) AS qty FROM order_items oi JOIN orders o ON o.id = oi.order_id
              WHERE o.${VALID} AND o.created_at >= ? GROUP BY oi.name ORDER BY qty DESC LIMIT 6`, d30),
    lowStock: all('SELECT id, name, stock FROM products WHERE deleted_at IS NULL AND is_active = 1 AND stock <= 5 ORDER BY stock, name LIMIT 6'),
    activeOrders: all(`${ORDER_SELECT} WHERE o.status IN (${ACTIVE.map(() => '?').join(',')}) ORDER BY o.slot_date, o.slot_start, o.id LIMIT 12`, ...ACTIVE),
  };
  sendHtml(ctx.res, V.dashboardPage(ctx, stats));
});

// ——— Chiffre d'affaires ——————————————————————————————————————————

const reportYear = (ctx) => { const ys = reportYears(); const y = Number(ctx.query.get('annee')); return ys.includes(y) ? y : ys[0]; };
get('/admin/statistiques', (ctx) => {
  admin(ctx);
  const days = [7, 30, 90].includes(Number(ctx.query.get('jours'))) ? Number(ctx.query.get('jours')) : 30;
  sendHtml(ctx.res, V.statsPage(ctx, { r: Analytics.report(days), days }));
});
get('/admin/chiffre-affaires', (ctx) => {
  admin(ctx);
  sendHtml(ctx.res, V.revenuePage(ctx, { report: yearReport(reportYear(ctx)), years: reportYears() }));
});
get('/admin/chiffre-affaires/export.csv', (ctx) => {
  admin(ctx);
  const year = reportYear(ctx);
  const eur = (c) => (c / 100).toFixed(2).replace('.', ',');
  const cell = (s) => { const t = String(s ?? ''); return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const rows = [['Numéro', 'Date', 'Heure', 'Client', 'Statut', 'Paiement', 'Produits TTC', 'Livraison TTC', 'Total TTC', 'Remboursé', 'Net encaissé']];
  for (const o of yearOrders(year)) {
    rows.push([o.number, o.paris.date.split('-').reverse().join('/'), o.paris.time, `${o.first_name} ${o.last_name}`, o.status === 'delivered' ? 'Livrée' : 'En cours',
      o.payment_method === 'card' ? 'Carte' : 'Espèces', eur(o.subtotal_cents), eur(o.delivery_fee_cents), eur(o.total_cents), eur(o.refunded_cents), eur(o.total_cents - o.refunded_cents)]);
  }
  send(ctx.res, 200, '\ufeff' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n', 'text/csv; charset=utf-8',
    { 'Content-Disposition': `attachment; filename="commandes-maison-green-${year}.csv"`, 'Cache-Control': 'no-store' });
});

// ——— Commandes ————————————————————————————————————————————————

const VIEWS = {
  'en-cours': [`o.status IN ('received','confirmed','preparing','ready','assigned','out_for_delivery')`, 'o.slot_date, o.slot_start, o.id'],
  aujourdhui: ['o.slot_date = :today AND o.status != \'awaiting_payment\'', 'o.slot_start, o.id'],
  especes: ["o.payment_method = 'cash' AND (o.payment_status = 'due_on_delivery' OR (o.cash_collected_at IS NOT NULL AND o.cash_remitted_at IS NULL))", 'o.slot_date, o.slot_start'],
  livrees: ["o.status = 'delivered'", 'o.delivered_at DESC'],
  annulees: ["o.status = 'cancelled'", 'o.id DESC'],
  paiement: ["o.status = 'awaiting_payment'", 'o.id DESC'],
  toutes: ['1 = 1', 'o.id DESC'],
};
get('/admin/commandes', (ctx) => {
  admin(ctx);
  const view = VIEWS[ctx.query.get('vue')] ? ctx.query.get('vue') : 'en-cours';
  const q = String(ctx.query.get('q') || '').trim().slice(0, 60);
  const today = parisNow().date;
  const where = (k) => VIEWS[k][0].replace(':today', `'${today}'`);
  let sql = `${ORDER_SELECT} WHERE ${where(view)}`;
  const params = [];
  if (q) {
    sql += ` AND (o.number LIKE ? OR o.first_name || ' ' || o.last_name LIKE ? OR REPLACE(o.phone,' ','') LIKE ? OR o.email LIKE ?)`;
    const like = `%${q}%`; params.push(like, like, `%${q.replace(/\s/g, '')}%`, like);
  }
  sql += ` ORDER BY ${VIEWS[view][1]} LIMIT 200`;
  const counts = {};
  for (const k of ['en-cours', 'aujourdhui', 'especes', 'paiement']) counts[k] = one(`SELECT COUNT(*) AS n FROM orders o WHERE ${where(k)}`).n;
  sendHtml(ctx.res, V.ordersPage(ctx, { orders: all(sql, ...params), view, q, counts }));
});

get('/admin/commandes/:id', (ctx) => {
  admin(ctx);
  const o = getOrder(Number(ctx.params.id));
  if (!o) throw new HttpError(404, 'Commande introuvable');
  sendHtml(ctx.res, V.orderDetailPage(ctx, { order: o, items: orderItems(o.id), events: orderEvents(o.id), drivers: listDrivers(), payments: paymentsFor(o.id) }));
});

async function orderAction(ctx, fn, okMsg) {
  const id = Number(ctx.params.id);
  try { await fn(id); if (okMsg) setFlash(ctx.res, 'success', okMsg); }
  catch (e) { if (!(e instanceof HttpError)) throw e; setFlash(ctx.res, 'error', e.message); }
  redirect(ctx.res, `/admin/commandes/${id}`);
}
post('/admin/commandes/:id/statut', (ctx) => {
  admin(ctx);
  return orderAction(ctx, (id) => setStatus(id, String(ctx.body.status), ctx.user, { reason: String(ctx.body.reason || '').slice(0, 200) }), 'Statut mis à jour.');
});
post('/admin/commandes/:id/livreur', (ctx) => {
  admin(ctx);
  return orderAction(ctx, (id) => assignDriver(id, Number(ctx.body.driver_id) || null, ctx.user), ctx.body.driver_id ? 'Livreur assigné et prévenu.' : 'Livreur retiré.');
});
post('/admin/commandes/:id/rembourser', (ctx) => {
  admin(ctx);
  const [cents, err] = v.money({ label: 'Le montant', required: false })(ctx.body.amount);
  if (err) { setFlash(ctx.res, 'error', err); return redirect(ctx.res, `/admin/commandes/${ctx.params.id}`); }
  return orderAction(ctx, async (id) => { const amt = await refundPayment(id, cents, ctx.user); setFlash(ctx.res, 'success', `${money(amt)} remboursés.`); });
});
post('/admin/commandes/:id/note', (ctx) => {
  admin(ctx);
  run('UPDATE orders SET internal_note = ? WHERE id = ?', String(ctx.body.note || '').slice(0, 1000), Number(ctx.params.id));
  setFlash(ctx.res, 'success', 'Note enregistrée.');
  redirect(ctx.res, `/admin/commandes/${ctx.params.id}`);
});

// Temps réel & notifications
get('/api/admin/events', (ctx) => { admin(ctx); subscribe(ctx.req, ctx.res, ['admin', `user:${ctx.user.id}`]); });
get('/api/notifications', (ctx) => {
  requireRole(ctx, 'admin', 'driver');
  sendJson(ctx.res, notificationsFor(ctx.user).map((n) => ({ id: n.id, kind: n.kind, order_id: n.order_id, title: n.title, body: n.body, link: n.link, unread: !n.read_at, created_at: n.created_at })));
});
// Alertes push : abonnement de l'appareil (boutique et livreurs).
get('/api/push/key', (ctx) => { requireRole(ctx, 'admin', 'driver'); sendJson(ctx.res, { key: Push.publicKey() }); });
post('/api/push/subscribe', (ctx) => {
  requireRole(ctx, 'admin', 'driver');
  const ok = Push.subscribe(ctx.user.id, ctx.body.endpoint, ctx.req.headers['user-agent'] || '', ctx.body.keys);
  sendJson(ctx.res, { ok }, ok ? 200 : 422);
});
post('/api/push/unsubscribe', (ctx) => { requireRole(ctx, 'admin', 'driver'); Push.unsubscribe(ctx.user.id, ctx.body.endpoint); sendJson(ctx.res, { ok: true }); });
post('/api/push/test', (ctx) => {
  requireRole(ctx, 'admin', 'driver');
  notify({ userId: ctx.user.id, kind: 'push_test', title: 'Alertes activées ✓', body: ctx.user.role === 'driver' ? 'Vous serez prévenu des nouvelles courses.' : 'Vous serez prévenu des nouvelles commandes.' });
  sendJson(ctx.res, { ok: true });
});
post('/api/notifications/read', (ctx) => { requireRole(ctx, 'admin', 'driver'); markAllRead(ctx.user); sendJson(ctx.res, { ok: true }); });
post('/admin/notifications/lues', (ctx) => { admin(ctx); markAllRead(ctx.user); redirect(ctx.res, ctx.req.headers.referer ? new URL(ctx.req.headers.referer).pathname : '/admin'); });
get('/api/admin/orders/:id/row', (ctx) => {
  admin(ctx);
  const o = one(`${ORDER_SELECT} WHERE o.id = ?`, Number(ctx.params.id));
  if (!o) throw new HttpError(404);
  sendJson(ctx.res, { html: String(V.ordersTable([o])), pending: one("SELECT COUNT(*) AS n FROM orders WHERE status = 'received'").n });
});

// ——— Produits ————————————————————————————————————————————————

get('/admin/produits', (ctx) => {
  admin(ctx);
  const q = String(ctx.query.get('q') || ''); const category = String(ctx.query.get('categorie') || ''); const stockFilter = String(ctx.query.get('stock') || '');
  let products = adminProducts({ q, category });
  if (stockFilter === 'bas') products = products.filter((p) => p.stock <= 5);
  sendHtml(ctx.res, V.productsPage(ctx, { products, categories: listCategories({ includeInactive: true }), q, category, stockFilter }));
});

// ——— Import / export du catalogue (CSV) ——————————————————————————
// Étape 1 : envoi du fichier → aperçu (rien n'est écrit). Étape 2 : confirmation → import en une transaction.
const pendingImports = new Map(); // jeton → { userId, products, mode, at }
const csvHeaders = (name) => ({ 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
get('/admin/produits/export.csv', (ctx) => { admin(ctx); send(ctx.res, 200, CatalogImport.toCsv(), 'text/csv; charset=utf-8', csvHeaders(`catalogue-maison-green-${parisNow().date}.csv`)); });
get('/admin/produits/modele.csv', (ctx) => { admin(ctx); send(ctx.res, 200, CatalogImport.toCsv({ empty: true }), 'text/csv; charset=utf-8', csvHeaders('modele-catalogue-maison-green.csv')); });
get('/admin/produits/import', (ctx) => {
  admin(ctx);
  sendHtml(ctx.res, V.importPage(ctx, { count: one('SELECT COUNT(*) AS n FROM products WHERE deleted_at IS NULL').n }));
});
post('/admin/produits/import', (ctx) => {
  admin(ctx);
  const count = one('SELECT COUNT(*) AS n FROM products WHERE deleted_at IS NULL').n;
  for (const [k, p] of pendingImports) if (Date.now() - p.at > 30 * 60e3) pendingImports.delete(k);
  if (ctx.body.token) {
    const p = pendingImports.get(String(ctx.body.token));
    if (!p || p.userId !== ctx.user.id) { setFlash(ctx.res, 'error', 'Aperçu expiré : renvoyez le fichier.'); return redirect(ctx.res, '/admin/produits/import'); }
    pendingImports.delete(String(ctx.body.token));
    const { stats, removedImages } = CatalogImport.apply(p.products, { mode: p.mode });
    removedImages.forEach(removeImage);
    const parts = [`${stats.created} ajouté${stats.created > 1 ? 's' : ''}`, `${stats.updated} mis à jour`];
    if (stats.removed) parts.push(`${stats.removed} retiré${stats.removed > 1 ? 's' : ''}`);
    if (stats.categories) parts.push(`${stats.categories} rayon${stats.categories > 1 ? 's' : ''} créé${stats.categories > 1 ? 's' : ''}`);
    setFlash(ctx.res, 'success', `Catalogue importé : ${parts.join(', ')}. Ajoutez maintenant les photos produit par produit.`);
    return redirect(ctx.res, '/admin/produits');
  }
  const file = ctx.files.fichier;
  if (!file) return sendHtml(ctx.res, V.importPage(ctx, { count, errors: ['Choisissez un fichier CSV.'] }), 422);
  if (/\.(xlsx?|numbers|ods)$/i.test(file.filename)) return sendHtml(ctx.res, V.importPage(ctx, { count, errors: ['Ce fichier est un classeur. Dans Excel ou Numbers : Fichier → Exporter / Enregistrer sous → format CSV, puis envoyez ce fichier .csv.'] }), 422);
  const mode = ctx.body.mode === 'remplacer' ? 'remplacer' : 'maj';
  const result = CatalogImport.analyse(file.data);
  if (result.errors.length) return sendHtml(ctx.res, V.importPage(ctx, { count, errors: result.errors, warnings: result.warnings }), 422);
  const token = crypto.randomBytes(16).toString('hex');
  pendingImports.set(token, { userId: ctx.user.id, products: result.products, mode, at: Date.now() });
  sendHtml(ctx.res, V.importPage(ctx, { count, warnings: result.warnings, preview: { token, mode, products: result.products, filename: file.filename } }));
});

const productSchema = {
  name: v.text({ label: 'Le nom', min: 2, max: 120 }), price: v.money(), unit: v.text({ label: 'Le format', max: 40 }),
  stock: v.int({ label: 'Le stock', max: 99999 }), max_per_order: v.int({ label: 'Le maximum', min: 1, max: 999 }),
  category_id: v.int({ label: 'La catégorie', min: 1 }), origin: v.text({ required: false, max: 80 }),
  description: v.longText({ label: 'La description', max: 1500 }), is_active: v.bool(), is_featured: v.bool(),
};

/** Enregistre une photo après vérification de son vrai format (signature binaire), jamais sur la seule extension. */
function saveImage(file) {
  if (!file) return null;
  const b = file.data;
  let ext = null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ext = 'jpg';
  else if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ext = 'png';
  else if (b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP') ext = 'webp';
  if (!ext) throw new HttpError(422, 'Format d’image non pris en charge (JPEG, PNG ou WebP).', { errors: { image: 'Format non pris en charge : JPEG, PNG ou WebP uniquement.' } });
  if (b.length > 5 * 1024 * 1024) throw new HttpError(422, 'Image trop lourde', { errors: { image: 'Image trop lourde (5 Mo maximum).' } });
  fs.mkdirSync(config.uploadsDir, { recursive: true });
  const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(config.uploadsDir, name), b);
  return `/uploads/${name}`;
}

/** Télécharge une photo depuis une adresse web (https uniquement, 5 Mo max), puis la vérifie comme un envoi classique. */
async function fetchImage(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { throw new HttpError(422, 'Adresse invalide', { errors: { image: 'Adresse de photo invalide.' } }); }
  if (u.protocol !== 'https:' || /^(localhost|\d+\.\d+\.\d+\.\d+|\[.*\])$/i.test(u.hostname) || u.hostname.endsWith('.internal')) {
    throw new HttpError(422, 'Adresse refusée', { errors: { image: 'Seules les adresses https publiques sont acceptées.' } });
  }
  const r = await fetch(u, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'MaisonGreen/1.0 (photos produit)' } });
  if (!r.ok) throw new HttpError(422, 'Téléchargement impossible', { errors: { image: `Photo introuvable (erreur ${r.status}).` } });
  const len = Number(r.headers.get('content-length') || 0);
  if (len > 5 * 1024 * 1024) throw new HttpError(422, 'Image trop lourde', { errors: { image: 'Image trop lourde (5 Mo maximum).' } });
  return { data: Buffer.from(await r.arrayBuffer()), filename: path.basename(u.pathname) || 'photo' };
}
function removeImage(url) {
  if (url && url.startsWith('/uploads/')) fs.rm(path.join(config.uploadsDir, path.basename(url)), () => {});
}
function uniqueSlug(name, exceptId = 0) {
  const base = slugify(name); let slug = base; let i = 2;
  while (one('SELECT 1 AS x FROM products WHERE slug = ? AND id != ?', slug, exceptId)) slug = `${base}-${i++}`;
  return slug;
}

get('/admin/produits/nouveau', (ctx) => {
  admin(ctx);
  sendHtml(ctx.res, V.productFormPage(ctx, { categories: listCategories({ includeInactive: true }), isNew: true, product: { is_active: 1, stock: 0, max_per_order: 20 } }));
});
post('/admin/produits/nouveau', (ctx) => {
  admin(ctx);
  const { data, errors, ok } = validate(productSchema, ctx.body);
  const cats = listCategories({ includeInactive: true });
  const back = (errs) => sendHtml(ctx.res, V.productFormPage(ctx, { categories: cats, isNew: true, errors: errs, product: { ...data, price_cents: typeof data.price === 'number' ? data.price : undefined } }), 422);
  if (!ok) return back(errors);
  let image = null;
  try { image = saveImage(ctx.files.image); } catch (e) { return back(e.errors || { image: e.message }); }
  const r = run(`INSERT INTO products (category_id, name, slug, description, origin, price_cents, unit, stock, max_per_order, image_url, is_active, is_featured)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, data.category_id, data.name, uniqueSlug(data.name), data.description, data.origin, data.price, data.unit,
    data.stock, data.max_per_order, image, data.is_active ? 1 : 0, data.is_featured ? 1 : 0);
  setFlash(ctx.res, 'success', `« ${data.name} » est en ligne.`);
  redirect(ctx.res, `/admin/produits/${r.lastInsertRowid}`);
});
get('/admin/produits/:id', (ctx) => {
  admin(ctx);
  const p = productById(Number(ctx.params.id));
  if (!p) throw new HttpError(404, 'Produit introuvable');
  sendHtml(ctx.res, V.productFormPage(ctx, { product: p, categories: listCategories({ includeInactive: true }) }));
});
post('/admin/produits/:id', async (ctx) => {
  admin(ctx);
  const p = productById(Number(ctx.params.id));
  if (!p) throw new HttpError(404);
  const { data, errors, ok } = validate(productSchema, ctx.body);
  const cats = listCategories({ includeInactive: true });
  const back = (errs) => sendHtml(ctx.res, V.productFormPage(ctx, { categories: cats, errors: errs, product: { ...p, ...data, price_cents: typeof data.price === 'number' ? data.price : p.price_cents } }), 422);
  if (!ok) return back(errors);
  let image = p.image_url;
  try {
    const webFile = !ctx.files.image && ctx.body.image_web ? await fetchImage(ctx.body.image_web) : null;
    const uploaded = saveImage(ctx.files.image || webFile);
    if (uploaded) { removeImage(p.image_url); image = uploaded; } else if (ctx.body.remove_image) { removeImage(p.image_url); image = null; }
  } catch (e) { return back(e.errors || { image: e.message }); }
  run(`UPDATE products SET category_id = ?, name = ?, slug = ?, description = ?, origin = ?, price_cents = ?, unit = ?, stock = ?, max_per_order = ?, image_url = ?,
       is_active = ?, is_featured = ?, updated_at = ? WHERE id = ?`, data.category_id, data.name, p.name === data.name ? p.slug : uniqueSlug(data.name, p.id),
  data.description, data.origin, data.price, data.unit, data.stock, data.max_per_order, image, data.is_active ? 1 : 0, data.is_featured ? 1 : 0, nowIso(), p.id);
  setFlash(ctx.res, 'success', 'Produit enregistré.');
  redirect(ctx.res, `/admin/produits/${p.id}`);
});
post('/admin/produits/:id/photo-web', async (ctx) => {
  admin(ctx);
  const p = productById(Number(ctx.params.id));
  if (!p) throw new HttpError(404, 'Produit introuvable');
  let out;
  try {
    const url = saveImage(await fetchImage(ctx.body.url));
    removeImage(p.image_url);
    run('UPDATE products SET image_url = ?, updated_at = ? WHERE id = ?', url, nowIso(), p.id);
    out = { ok: true, image_url: url };
  } catch (e) { out = { ok: false, error: e.errors?.image || e.message }; }
  send(ctx.res, out.ok ? 200 : 422, JSON.stringify(out), 'application/json; charset=utf-8');
});
post('/admin/produits/:id/stock', (ctx) => {
  admin(ctx);
  const [n, err] = v.int({ label: 'Le stock', max: 99999 })(ctx.body.stock);
  if (err) setFlash(ctx.res, 'error', err);
  else { run('UPDATE products SET stock = ?, updated_at = ? WHERE id = ?', n, nowIso(), Number(ctx.params.id)); setFlash(ctx.res, 'success', 'Stock mis à jour.'); }
  redirect(ctx.res, ctx.req.headers.referer ? new URL(ctx.req.headers.referer).pathname + new URL(ctx.req.headers.referer).search : '/admin/produits');
});
post('/admin/produits/:id/visibilite', (ctx) => {
  admin(ctx);
  run('UPDATE products SET is_active = ?, updated_at = ? WHERE id = ?', ctx.body.is_active ? 1 : 0, nowIso(), Number(ctx.params.id));
  setFlash(ctx.res, 'success', ctx.body.is_active ? 'Produit remis en vente.' : 'Produit masqué de la boutique.');
  redirect(ctx.res, ctx.req.headers.referer ? new URL(ctx.req.headers.referer).pathname + new URL(ctx.req.headers.referer).search : '/admin/produits');
});
post('/admin/produits/:id/supprimer', (ctx) => {
  admin(ctx);
  const p = productById(Number(ctx.params.id));
  if (p) { run('UPDATE products SET deleted_at = ?, is_active = 0, slug = ? WHERE id = ?', nowIso(), `${p.slug}-supprime-${p.id}`, p.id); removeImage(p.image_url); }
  setFlash(ctx.res, 'success', 'Produit supprimé.');
  redirect(ctx.res, '/admin/produits');
});

// ——— Catégories ——————————————————————————————————————————————

const TONES = ['sage', 'sky', 'sand', 'blush', 'butter', 'stone'];
get('/admin/categories', (ctx) => { admin(ctx); sendHtml(ctx.res, V.categoriesPage(ctx, { categories: listCategories({ withCounts: true, includeInactive: true }) })); });
post('/admin/categories', (ctx) => {
  admin(ctx);
  const { data, errors, ok } = validate({ name: v.text({ label: 'Le nom', max: 60 }), description: v.text({ required: false, max: 160 }), tone: v.oneOf(TONES), age_restricted: v.bool(), legal_notice: v.text({ required: false, max: 300 }) }, ctx.body);
  if (!ok) return sendHtml(ctx.res, V.categoriesPage(ctx, { categories: listCategories({ withCounts: true, includeInactive: true }), errors }), 422);
  let slug = slugify(data.name); if (one('SELECT 1 AS x FROM categories WHERE slug = ?', slug)) slug += `-${Date.now().toString(36)}`;
  run('INSERT INTO categories (name, slug, description, tone, position, age_restricted, legal_notice) VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position),0)+1 FROM categories), ?, ?)', data.name, slug, data.description, data.tone, data.age_restricted ? 1 : 0, data.legal_notice || '');
  setFlash(ctx.res, 'success', 'Catégorie ajoutée.');
  redirect(ctx.res, '/admin/categories');
});
post('/admin/categories/:id', (ctx) => {
  admin(ctx);
  const { data, ok, errors } = validate({ name: v.text({ label: 'Le nom', max: 60 }), description: v.text({ required: false, max: 160 }), tone: v.oneOf(TONES), position: v.int({ label: "L'ordre", max: 999 }), is_active: v.bool(), age_restricted: v.bool(), legal_notice: v.text({ required: false, max: 300 }) }, ctx.body);
  if (!ok) { setFlash(ctx.res, 'error', Object.values(errors)[0]); return redirect(ctx.res, '/admin/categories'); }
  run('UPDATE categories SET name = ?, description = ?, tone = ?, position = ?, is_active = ?, age_restricted = ?, legal_notice = ? WHERE id = ?', data.name, data.description, data.tone, data.position, data.is_active ? 1 : 0, data.age_restricted ? 1 : 0, data.legal_notice || '', Number(ctx.params.id));
  setFlash(ctx.res, 'success', 'Catégorie enregistrée.');
  redirect(ctx.res, '/admin/categories');
});
post('/admin/categories/:id/supprimer', (ctx) => {
  admin(ctx);
  const n = one('SELECT COUNT(*) AS n FROM products WHERE category_id = ? AND deleted_at IS NULL', Number(ctx.params.id)).n;
  if (n) setFlash(ctx.res, 'error', `Cette catégorie contient ${n} produit${n > 1 ? 's' : ''} : déplacez-les ou masquez la catégorie.`);
  else { run('DELETE FROM categories WHERE id = ?', Number(ctx.params.id)); setFlash(ctx.res, 'success', 'Catégorie supprimée.'); }
  redirect(ctx.res, '/admin/categories');
});

// ——— Zones ——————————————————————————————————————————————————

const zoneSchema = {
  name: v.text({ label: 'Le nom', max: 80 }), postal_codes: v.text({ label: 'Les codes postaux', max: 400 }),
  fee: v.money({ label: 'Les frais' }), free_over: v.money({ label: 'Le seuil', required: false }),
  eta_minutes: v.int({ label: 'Le délai', min: 5, max: 600 }), is_active: v.bool(),
};
function zoneData(ctx, id = 0) {
  const { data, errors } = validate(zoneSchema, ctx.body);
  const codes = String(data.postal_codes || '').split(/[\s,;]+/).filter(Boolean);
  if (codes.some((c) => !/^\d{5}$/.test(c))) errors.postal_codes = 'Chaque code postal doit comporter 5 chiffres.';
  const taken = all('SELECT name, postal_codes FROM delivery_zones WHERE id != ?', id).flatMap((z) => z.postal_codes.split(/[\s,;]+/).filter((c) => codes.includes(c)).map((c) => `${c} (${z.name})`));
  if (taken.length) errors.postal_codes = `Déjà utilisé dans une autre zone : ${taken.join(', ')}.`;
  return { data: { ...data, postal_codes: codes.join(', ') }, errors };
}
get('/admin/zones', (ctx) => { admin(ctx); sendHtml(ctx.res, V.zonesPage(ctx, { zones: all('SELECT * FROM delivery_zones ORDER BY position, id') })); });
post('/admin/zones', (ctx) => {
  admin(ctx);
  const { data, errors } = zoneData(ctx);
  if (Object.keys(errors).length) return sendHtml(ctx.res, V.zonesPage(ctx, { zones: all('SELECT * FROM delivery_zones ORDER BY position, id'), errors: { form: Object.values(errors).join(' ') } }), 422);
  run('INSERT INTO delivery_zones (name, postal_codes, fee_cents, min_order_cents, free_over_cents, eta_minutes, position) VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position),0)+1 FROM delivery_zones))',
    data.name, data.postal_codes, data.fee, 0, data.free_over || null, data.eta_minutes);
  setFlash(ctx.res, 'success', 'Zone ajoutée.');
  redirect(ctx.res, '/admin/zones');
});
post('/admin/zones/:id', (ctx) => {
  admin(ctx);
  const id = Number(ctx.params.id);
  const { data, errors } = zoneData(ctx, id);
  if (Object.keys(errors).length) return sendHtml(ctx.res, V.zonesPage(ctx, { zones: all('SELECT * FROM delivery_zones ORDER BY position, id'), errors: { form: Object.values(errors).join(' ') } }), 422);
  run('UPDATE delivery_zones SET name = ?, postal_codes = ?, fee_cents = ?, min_order_cents = ?, free_over_cents = ?, eta_minutes = ?, is_active = ? WHERE id = ?',
    data.name, data.postal_codes, data.fee, 0, data.free_over || null, data.eta_minutes, data.is_active ? 1 : 0, id);
  setFlash(ctx.res, 'success', 'Zone enregistrée.');
  redirect(ctx.res, '/admin/zones');
});
post('/admin/zones/:id/supprimer', (ctx) => {
  admin(ctx);
  run('DELETE FROM delivery_zones WHERE id = ?', Number(ctx.params.id));
  setFlash(ctx.res, 'success', 'Zone supprimée.');
  redirect(ctx.res, '/admin/zones');
});

// ——— Horaires, créneaux, fermetures ——————————————————————————————

const hoursData = (ctx, errors = {}) => V.hoursPage(ctx, {
  hours: all('SELECT * FROM opening_hours'), slots: all('SELECT * FROM delivery_slots ORDER BY weekday, starts_at'),
  closures: all('SELECT * FROM closures WHERE date >= ? ORDER BY date', parisNow().date), errors,
  shop: shopInfo(),
  lastBackup: getSetting('last_backup_at', null),
  resetCounts: { orders: one('SELECT COUNT(*) AS n FROM orders').n, customers: one("SELECT COUNT(*) AS n FROM users WHERE role = 'customer'").n },
  settings: { paused: getSetting('orders_paused', false), pauseMessage: getSetting('pause_message', 'Les commandes sont momentanément suspendues. Revenez très vite.'), leadTime: getSetting('lead_time_minutes', 45) },
});
get('/admin/horaires', (ctx) => { admin(ctx); sendHtml(ctx.res, hoursData(ctx)); });
// Sauvegarde : téléchargement d'une copie complète de la base (commandes, produits, clients, réglages).
get('/admin/sauvegarde', (ctx) => {
  admin(ctx);
  const file = path.join(os.tmpdir(), `mg-backup-${crypto.randomBytes(6).toString('hex')}.db`);
  backupTo(file);
  setSetting('last_backup_at', nowIso());
  const size = fs.statSync(file).size;
  ctx.res.writeHead(200, { 'Content-Type': 'application/vnd.sqlite3', 'Content-Length': size, 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="sauvegarde-maison-green-${parisNow().date}.db"` });
  const stream = fs.createReadStream(file);
  stream.pipe(ctx.res);
  const cleanup = () => fs.rm(file, { force: true }, () => {});
  stream.on('close', cleanup); stream.on('error', cleanup);
});

// Remise à zéro avant l'ouverture : efface les commandes de test (et, au choix, les comptes clients de test).
// Produits, rayons, zones, horaires, livreurs et réglages sont conservés. La numérotation repart à MG-1001.
post('/admin/remise-a-zero', (ctx) => {
  admin(ctx);
  if (String(ctx.body.confirm || '').trim().toUpperCase() !== 'EFFACER') {
    setFlash(ctx.res, 'error', 'Rien n’a été effacé : tapez EFFACER pour confirmer.');
    return redirect(ctx.res, '/admin/horaires#remise-a-zero');
  }
  const n = one('SELECT COUNT(*) AS n FROM orders').n;
  let customers = 0;
  tx(() => {
    for (const t of ['order_items', 'order_events', 'payments']) run(`DELETE FROM ${t}`);
    run('DELETE FROM notifications');
    run('DELETE FROM webhook_events');
    Analytics.clearAnalytics(); // visites de test
    run('DELETE FROM orders');
    run("DELETE FROM sqlite_sequence WHERE name IN ('orders','order_items','order_events','payments','notifications')");
    if (ctx.body.customers) {
      const ids = all("SELECT id FROM users WHERE role = 'customer'").map((u) => u.id);
      for (const id of ids) { run('DELETE FROM addresses WHERE user_id = ?', id); run('DELETE FROM sessions WHERE user_id = ?', id); run('DELETE FROM users WHERE id = ?', id); }
      customers = ids.length;
    }
  });
  setFlash(ctx.res, 'success', `Remise à zéro faite : ${n} commande${n > 1 ? 's' : ''} effacée${n > 1 ? 's' : ''}${customers ? `, ${customers} compte${customers > 1 ? 's' : ''} client${customers > 1 ? 's' : ''} supprimé${customers > 1 ? 's' : ''}` : ''}. La prochaine commande sera la MG-1001.`);
  redirect(ctx.res, '/admin/horaires');
});

post('/admin/boutique', (ctx) => {
  admin(ctx);
  const { data, errors, ok } = validate({
    address: v.text({ label: "L'adresse", max: 120 }), postal: v.postal(), city: v.text({ label: 'La ville', max: 60 }),
    phone: v.phone({ required: false }), email: v.email(),
  }, ctx.body);
  if (!ok) return sendHtml(ctx.res, hoursData(ctx, { form: Object.values(errors)[0] }), 422);
  setSetting('shop', { ...getSetting('shop', {}), name: 'Maison Green', ...data });
  setSetting('shop_email', data.email);
  setFlash(ctx.res, 'success', 'Coordonnées de la boutique enregistrées : elles apparaissent sur le site et dans les pages légales.');
  redirect(ctx.res, '/admin/horaires');
});
// Informations légales (mentions légales et CGV) et nom affiché de l'administrateur.
post('/admin/boutique/legal', (ctx) => {
  admin(ctx);
  const t = (label, max, required = false) => v.text({ label, max, required });
  const { data, errors, ok } = validate({
    legal_name: t('La raison sociale', 120), legal_form: t('La forme juridique', 80), legal_capital: t('Le capital', 30),
    legal_siren: t('Le SIREN / SIRET', 30), legal_rcs: t('La ville du RCS', 60), legal_tva: t('Le n° de TVA', 40),
    legal_manager: t('Le directeur de la publication', 80), legal_mediator: t('Le médiateur', 200),
    first_name: t('Votre prénom', 60, true), last_name: t('Votre nom', 60),
  }, ctx.body);
  if (!ok) return sendHtml(ctx.res, hoursData(ctx, { form: Object.values(errors)[0] }), 422);
  const { first_name, last_name, ...legal } = data;
  setSetting('shop', { ...getSetting('shop', {}), ...legal });
  run('UPDATE users SET first_name = ?, last_name = ? WHERE id = ?', first_name, last_name || '', ctx.user.id);
  setFlash(ctx.res, 'success', 'Informations légales enregistrées : les mentions légales et les CGV sont à jour.');
  redirect(ctx.res, '/admin/horaires');
});
// Google Search Console : code de validation (balise meta « google-site-verification »).
post('/admin/boutique/google', (ctx) => {
  admin(ctx);
  const raw = String(ctx.body.google_verification || '').trim();
  const code = (raw.match(/content=["']([^"']+)["']/) || [null, raw])[1].replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100);
  setSetting('google_verification', code);
  setFlash(ctx.res, 'success', code ? 'Code Google enregistré : vous pouvez cliquer sur « Valider » dans la Search Console.' : 'Code Google retiré.');
  redirect(ctx.res, '/admin/horaires');
});
post('/admin/horaires/reglages', (ctx) => {
  admin(ctx);
  const [lead, err] = v.int({ label: 'Le délai', max: 1440 })(ctx.body.lead_time_minutes);
  if (err) return sendHtml(ctx.res, hoursData(ctx, { form: err }), 422);
  setSetting('orders_paused', Boolean(ctx.body.orders_paused));
  setSetting('pause_message', String(ctx.body.pause_message || '').slice(0, 200) || 'Les commandes sont momentanément suspendues.');
  setSetting('lead_time_minutes', lead);
  setFlash(ctx.res, 'success', ctx.body.orders_paused ? 'Commandes suspendues : la boutique affiche votre message.' : 'Réglages enregistrés.');
  redirect(ctx.res, '/admin/horaires');
});
post('/admin/horaires/ouverture', (ctx) => {
  admin(ctx);
  const rows = [];
  for (let wd = 0; wd < 7; wd++) {
    const [o, e1] = v.time({ label: `L'ouverture du ${WEEKDAYS[wd].toLowerCase()}` })(ctx.body[`opens_${wd}`]);
    const [c, e2] = v.time({ label: `La fermeture du ${WEEKDAYS[wd].toLowerCase()}` })(ctx.body[`closes_${wd}`]);
    if (e1 || e2) return sendHtml(ctx.res, hoursData(ctx, { form: e1 || e2 }), 422);
    if (o >= c) return sendHtml(ctx.res, hoursData(ctx, { form: `${WEEKDAYS[wd]} : la fermeture doit être après l'ouverture.` }), 422);
    rows.push([wd, ctx.body[`open_${wd}`] ? 1 : 0, o, c]);
  }
  tx(() => { for (const r of rows) run('INSERT INTO opening_hours (weekday, is_open, opens_at, closes_at) VALUES (?, ?, ?, ?) ON CONFLICT(weekday) DO UPDATE SET is_open = excluded.is_open, opens_at = excluded.opens_at, closes_at = excluded.closes_at', ...r); });
  setFlash(ctx.res, 'success', 'Horaires enregistrés.');
  redirect(ctx.res, '/admin/horaires');
});
post('/admin/creneaux', (ctx) => {
  admin(ctx);
  const { data, errors, ok } = validate({ starts_at: v.time({ label: 'Le début' }), ends_at: v.time({ label: 'La fin' }), capacity: v.int({ label: 'La capacité', min: 1, max: 200 }) }, ctx.body);
  if (!ok || data.starts_at >= data.ends_at) return sendHtml(ctx.res, hoursData(ctx, { form: Object.values(errors)[0] || 'La fin du créneau doit être après son début.' }), 422);
  const days = ctx.body.weekday === 'all' ? [1, 2, 3, 4, 5, 6] : [Number(ctx.body.weekday)].filter((d) => d >= 0 && d <= 6);
  tx(() => { for (const d of days) if (!one('SELECT 1 AS x FROM delivery_slots WHERE weekday = ? AND starts_at = ?', d, data.starts_at)) run('INSERT INTO delivery_slots (weekday, starts_at, ends_at, capacity) VALUES (?, ?, ?, ?)', d, data.starts_at, data.ends_at, data.capacity); });
  setFlash(ctx.res, 'success', 'Créneau ajouté.');
  redirect(ctx.res, '/admin/horaires');
});
post('/admin/creneaux/:id/basculer', (ctx) => { admin(ctx); run('UPDATE delivery_slots SET is_active = 1 - is_active WHERE id = ?', Number(ctx.params.id)); redirect(ctx.res, '/admin/horaires'); });
post('/admin/creneaux/:id/supprimer', (ctx) => { admin(ctx); run('DELETE FROM delivery_slots WHERE id = ?', Number(ctx.params.id)); setFlash(ctx.res, 'success', 'Créneau supprimé.'); redirect(ctx.res, '/admin/horaires'); });
post('/admin/fermetures', (ctx) => {
  admin(ctx);
  const [date, err] = v.date()(ctx.body.date);
  if (err) return sendHtml(ctx.res, hoursData(ctx, { form: err }), 422);
  run('INSERT INTO closures (date, label) VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET label = excluded.label', date, String(ctx.body.label || 'Fermeture exceptionnelle').slice(0, 80));
  setFlash(ctx.res, 'success', 'Fermeture ajoutée : aucun créneau ne sera proposé ce jour-là.');
  redirect(ctx.res, '/admin/horaires');
});
post('/admin/fermetures/:id/supprimer', (ctx) => { admin(ctx); run('DELETE FROM closures WHERE id = ?', Number(ctx.params.id)); redirect(ctx.res, '/admin/horaires'); });

// ——— Livreurs ————————————————————————————————————————————————

function driversWithStats() {
  const today = parisToUtc(parisNow().date, '00:00').toISOString();
  return listDrivers().map((d) => ({
    ...d,
    delivered_today: one("SELECT COUNT(*) AS n FROM orders WHERE driver_id = ? AND status = 'delivered' AND delivered_at >= ?", d.id, today).n,
    cash_held: one('SELECT COALESCE(SUM(cash_to_collect_cents),0) AS n FROM orders WHERE driver_id = ? AND cash_collected_at IS NOT NULL AND cash_remitted_at IS NULL', d.id).n,
  }));
}
// Identifiants à afficher une seule fois, après redirection (un rafraîchissement de page ne recrée pas de mot de passe).
const shownCreds = new Map(); // jeton → { data, at }
function showCreds(ctx, created) {
  for (const [k, v] of shownCreds) if (Date.now() - v.at > 10 * 60e3) shownCreds.delete(k);
  const token = crypto.randomBytes(12).toString('hex');
  shownCreds.set(token, { created, adminId: ctx.user.id, at: Date.now() });
  redirect(ctx.res, `/admin/livreurs?identifiants=${token}`);
}
get('/admin/livreurs', (ctx) => {
  admin(ctx);
  const token = String(ctx.query.get('identifiants') || '');
  const entry = shownCreds.get(token);
  if (entry) shownCreds.delete(token);
  sendHtml(ctx.res, V.driversPage(ctx, { drivers: driversWithStats(), created: entry && entry.adminId === ctx.user.id ? entry.created : null }));
});
post('/admin/livreurs', (ctx) => {
  admin(ctx);
  const { data, errors } = validate({ first_name: v.text({ label: 'Le prénom', max: 60 }), last_name: v.text({ label: 'Le nom', max: 60 }), email: v.email(), phone: v.phone(), vehicle: v.text({ max: 40 }) }, ctx.body);
  if (!errors.email && one('SELECT 1 AS x FROM users WHERE email = ?', data.email)) errors.email = 'Cet e-mail est déjà utilisé.';
  if (Object.keys(errors).length) return sendHtml(ctx.res, V.driversPage(ctx, { drivers: driversWithStats(), errors, values: data }), 422);
  const password = `${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(3).toString('hex')}`;
  tx(() => {
    const r = run("INSERT INTO users (email, password_hash, role, first_name, last_name, phone) VALUES (?, ?, 'driver', ?, ?, ?)", data.email, hashPassword(password), data.first_name, data.last_name, data.phone);
    run('INSERT INTO drivers (user_id, vehicle) VALUES (?, ?)', Number(r.lastInsertRowid), data.vehicle || 'Vélo');
  });
  showCreds(ctx, { ...data, password });
});
post('/admin/livreurs/:id/activer', (ctx) => {
  admin(ctx);
  const id = Number(ctx.params.id);
  run("UPDATE users SET is_active = 1 - is_active WHERE id = ? AND role = 'driver'", id);
  run("DELETE FROM sessions WHERE user_id = ? AND (SELECT is_active FROM users WHERE id = ?) = 0", id, id);
  redirect(ctx.res, '/admin/livreurs');
});
// Mot de passe oublié par un livreur : on en génère un nouveau (l'ancien ne marche plus, ses appareils sont déconnectés).
post('/admin/livreurs/:id/mot-de-passe', (ctx) => {
  admin(ctx);
  const d = one("SELECT id, first_name, last_name, email FROM users WHERE id = ? AND role = 'driver'", Number(ctx.params.id));
  if (!d) throw new HttpError(404, 'Livreur introuvable');
  const password = `${crypto.randomBytes(4).toString('hex')}-${crypto.randomBytes(3).toString('hex')}`;
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), d.id);
  revokeAllSessions(d.id);
  showCreds(ctx, { ...d, password, reset: true });
});
post('/admin/livreurs/:id/especes', (ctx) => {
  admin(ctx);
  const total = remitCash(Number(ctx.params.id), ctx.user);
  setFlash(ctx.res, 'success', `${money(total)} enregistrés en caisse.`);
  redirect(ctx.res, '/admin/livreurs');
});
