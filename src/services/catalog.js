// Catalogue : catégories, produits, recherche, chiffrage du panier (prix toujours recalculés côté serveur).
import { all, one } from '../db.js';

export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const categories = ({ withCounts = false, includeInactive = false } = {}) =>
  all(`SELECT c.*${withCounts ? `, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = 1 AND p.deleted_at IS NULL) AS product_count` : ''}
       FROM categories c ${includeInactive ? '' : 'WHERE c.is_active = 1'} ORDER BY c.position, c.name`);

const BASE = `SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.tone AS tone
              FROM products p LEFT JOIN categories c ON c.id = p.category_id`;

/** Produits visibles côté client (actifs, catégorie active). */
export function shopProducts({ q = '', category = '' } = {}) {
  let rows = all(`${BASE} WHERE p.deleted_at IS NULL AND p.is_active = 1 AND (c.is_active = 1 OR c.id IS NULL)
                  ORDER BY c.position, p.is_featured DESC, p.name`);
  if (category) rows = rows.filter((p) => p.category_slug === category);
  if (q) {
    const terms = norm(q).split(/\s+/).filter(Boolean);
    rows = rows.filter((p) => { const hay = norm(`${p.name} ${p.description} ${p.category_name} ${p.origin}`); return terms.every((t) => hay.includes(t)); });
  }
  return rows;
}

export const featuredProducts = (limit = 8) =>
  all(`${BASE} WHERE p.deleted_at IS NULL AND p.is_active = 1 AND c.is_active = 1 AND p.stock > 0
       ORDER BY p.is_featured DESC, (SELECT COALESCE(SUM(quantity),0) FROM order_items oi WHERE oi.product_id = p.id) DESC LIMIT ?`, limit);

export const productBySlug = (slug) => one(`${BASE} WHERE p.slug = ? AND p.deleted_at IS NULL AND p.is_active = 1`, slug);
export const productById = (id) => one(`${BASE} WHERE p.id = ? AND p.deleted_at IS NULL`, id);

export const adminProducts = ({ q = '', category = '' } = {}) => {
  let rows = all(`${BASE} WHERE p.deleted_at IS NULL ORDER BY c.position, p.name`);
  if (category) rows = rows.filter((p) => String(p.category_id) === String(category));
  if (q) rows = rows.filter((p) => norm(p.name).includes(norm(q)));
  return rows;
};

/**
 * Chiffre un panier envoyé par le navigateur : [{ id, qty }].
 * Ne fait jamais confiance aux prix du client ; signale les produits indisponibles ou en stock insuffisant.
 */
export function quoteCart(items) {
  const lines = []; const issues = [];
  const seen = new Map();
  for (const it of Array.isArray(items) ? items.slice(0, 100) : []) {
    const id = Number(it?.id); const qty = Math.floor(Number(it?.qty));
    if (!Number.isInteger(id) || !(qty > 0)) continue;
    seen.set(id, Math.min(99, (seen.get(id) || 0) + qty));
  }
  for (const [id, wanted] of seen) {
    const p = productById(id);
    if (!p || !p.is_active) { issues.push({ id, type: 'unavailable', message: 'Un produit de votre panier n’est plus disponible et a été retiré.' }); continue; }
    if (p.stock <= 0) { issues.push({ id, type: 'out_of_stock', message: `${p.name} est en rupture de stock.` }); continue; }
    const max = Math.min(p.stock, p.max_per_order);
    const qty = Math.min(wanted, max);
    if (qty < wanted) issues.push({ id, type: 'limited', message: `${p.name} : ${max} maximum disponible${max > 1 ? 's' : ''}, quantité ajustée.` });
    lines.push({ id: p.id, slug: p.slug, name: p.name, unit: p.unit, image_url: p.image_url, tone: p.tone, category: p.category_name,
      unit_price_cents: p.price_cents, quantity: qty, max, line_total_cents: qty * p.price_cents });
  }
  const subtotal = lines.reduce((s, l) => s + l.line_total_cents, 0);
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  return { lines, issues, subtotal, count };
}
