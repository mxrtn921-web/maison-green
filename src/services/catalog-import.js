// Import / export du catalogue au format CSV (compatible Excel, Numbers, Google Sheets).
// Colonnes : nom ; rayon ; prix ; format ; stock ; origine ; description ; vedette ; en_ligne ; max_par_commande
import { one, all, run, tx, nowIso } from '../db.js';
import { v, slugify } from '../lib/validate.js';

export const COLUMNS = ['nom', 'rayon', 'prix', 'format', 'stock', 'origine', 'description', 'vedette', 'en_ligne', 'max_par_commande'];
const REQUIRED = ['nom', 'rayon', 'prix'];
const TONES = ['sage', 'sky', 'sand', 'blush', 'butter', 'stone'];

// Noms de colonnes acceptés (sans accents, minuscules)
const ALIASES = {
  nom: ['nom', 'produit', 'nom du produit', 'article', 'designation'],
  rayon: ['rayon', 'categorie', 'category', 'famille'],
  prix: ['prix', 'prix ttc', 'prix (eur)', 'prix eur', 'prix de vente', 'price'],
  format: ['format', 'unite', 'conditionnement', 'contenance', 'poids'],
  stock: ['stock', 'quantite', 'qte', 'quantite en stock'],
  origine: ['origine', 'provenance'],
  description: ['description', 'descriptif'],
  vedette: ['vedette', 'mis en avant', 'mise en avant', 'coup de coeur'],
  en_ligne: ['en ligne', 'en_ligne', 'visible', 'actif', 'disponible'],
  max_par_commande: ['max par commande', 'max_par_commande', 'maximum', 'max'],
};
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_\s]+/g, ' ').trim();

/** Décode le fichier : UTF-8 (avec ou sans BOM), sinon Windows-1252 (ancien Excel). */
export function decode(buf) {
  let text = buf.toString('utf8');
  if (text.includes('\ufffd')) text = new TextDecoder('windows-1252').decode(buf);
  return text.replace(/^\ufeff/, '');
}

/** Parse un CSV (séparateur « ; », « , » ou tabulation détecté automatiquement, guillemets gérés). */
export function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const count = (c) => firstLine.split(c).length - 1;
  const sep = [';', ',', '\t'].sort((a, b) => count(b) - count(a))[0];
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const yes = (s, dflt) => { const n = norm(s); if (!n) return dflt; return ['oui', 'o', 'x', '1', 'yes', 'vrai', 'true'].includes(n); };

/** Analyse le fichier et renvoie { products, errors, warnings } sans rien écrire. */
export function analyse(buf) {
  const rows = parseCsv(decode(buf));
  if (!rows.length) return { products: [], errors: ['Le fichier est vide.'], warnings: [] };
  const header = rows[0].map(norm);
  const idx = {};
  for (const col of COLUMNS) idx[col] = header.findIndex((h) => ALIASES[col].includes(h));
  const missing = REQUIRED.filter((c) => idx[c] === -1);
  if (missing.length) return { products: [], errors: [`Colonne${missing.length > 1 ? 's' : ''} introuvable${missing.length > 1 ? 's' : ''} : ${missing.join(', ')}. La première ligne doit contenir les titres (nom ; rayon ; prix ; format ; stock…).`], warnings: [] };

  const errors = []; const warnings = []; const products = []; const seen = new Map();
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const get = (c) => (idx[c] === -1 ? '' : String(r[idx[c]] ?? '').trim());
    const e = [];
    const [name, eName] = v.text({ label: 'Le nom', min: 2, max: 120 })(get('nom'));
    const [category, eCat] = v.text({ label: 'Le rayon', max: 60 })(get('rayon'));
    const [price, ePrice] = v.money()(get('prix'));
    const [unit, eUnit] = v.text({ label: 'Le format', max: 40, required: false })(get('format'));
    const [stock, eStock] = v.int({ label: 'Le stock', max: 99999, required: false })(get('stock').replace(/\s/g, ''));
    const [maxPer, eMax] = v.int({ label: 'Le maximum par commande', min: 1, max: 999, required: false })(get('max_par_commande'));
    const [origin, eOrig] = v.text({ label: "L'origine", max: 80, required: false })(get('origine'));
    const [description, eDesc] = v.longText({ label: 'La description', max: 1500 })(get('description'));
    for (const x of [eName, eCat, ePrice, eUnit, eStock, eMax, eOrig, eDesc]) if (x) e.push(x);
    if (e.length) { errors.push(`Ligne ${line}${name ? ` (${name})` : ''} : ${e.join(' ')}`); return; }
    const key = norm(name) + '|' + norm(unit);
    if (seen.has(key)) { errors.push(`Ligne ${line} : « ${name} »${unit ? ` (${unit})` : ''} apparaît déjà ligne ${seen.get(key)}.`); return; }
    seen.set(key, line);
    if (stock === null) warnings.push(`Ligne ${line} (${name}) : stock non renseigné, mis à 0 (produit affiché « épuisé »).`);
    products.push({ line, name, category, price, unit: unit || 'pièce', stock: stock ?? 0, max_per_order: maxPer ?? 20, origin, description,
      is_featured: yes(get('vedette'), false), is_active: yes(get('en_ligne'), true) });
  });
  if (!products.length && !errors.length) errors.push('Aucun produit trouvé sous la ligne de titres.');
  return { products, errors, warnings };
}

function uniqueSlug(name, exceptId = 0) {
  const base = slugify(name); let slug = base; let i = 2;
  while (one('SELECT 1 AS x FROM products WHERE slug = ? AND id != ?', slug, exceptId)) slug = `${base}-${i++}`;
  return slug;
}

/**
 * Applique l'import. mode = 'maj' (ajoute / met à jour, garde le reste) ou 'remplacer' (retire les produits absents du fichier).
 * Les rayons ne sont jamais supprimés : un rayon vide est simplement masqué dans la boutique.
 * Les produits existants sont reconnus par leur nom + format : leur photo est conservée.
 */
export function apply(products, { mode = 'maj' } = {}) {
  const stats = { created: 0, updated: 0, removed: 0, categories: 0, removedCategories: 0 };
  const removedImages = [];
  tx(() => {
    const cats = new Map(all('SELECT id, name FROM categories').map((c) => [norm(c.name), c.id]));
    const usedCats = new Set();
    const catId = (name) => {
      const k = norm(name);
      if (!cats.has(k)) {
        let slug = slugify(name); if (one('SELECT 1 AS x FROM categories WHERE slug = ?', slug)) slug += `-${Date.now().toString(36)}`;
        const pos = one('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM categories').p;
        const r = run('INSERT INTO categories (name, slug, tone, position) VALUES (?, ?, ?, ?)', name, slug, TONES[pos % TONES.length], pos);
        cats.set(k, Number(r.lastInsertRowid)); stats.categories++;
      }
      const id = cats.get(k); usedCats.add(id);
      run('UPDATE categories SET is_active = 1 WHERE id = ?', id);
      return id;
    };
    const existing = all('SELECT id, name, unit, image_url FROM products WHERE deleted_at IS NULL');
    const byKey = new Map(existing.map((p) => [norm(p.name) + '|' + norm(p.unit), p]));
    const byName = new Map(); for (const p of existing) { const k = norm(p.name); byName.set(k, byName.has(k) ? null : p); }
    const kept = new Set();
    for (const p of products) {
      const cid = catId(p.category);
      const found = byKey.get(norm(p.name) + '|' + norm(p.unit)) || byName.get(norm(p.name));
      if (found && !kept.has(found.id)) {
        run(`UPDATE products SET category_id = ?, name = ?, description = ?, origin = ?, price_cents = ?, unit = ?, stock = ?, max_per_order = ?,
             is_active = ?, is_featured = ?, updated_at = ? WHERE id = ?`, cid, p.name, p.description, p.origin, p.price, p.unit, p.stock, p.max_per_order,
        p.is_active ? 1 : 0, p.is_featured ? 1 : 0, nowIso(), found.id);
        kept.add(found.id); stats.updated++;
      } else {
        const r = run(`INSERT INTO products (category_id, name, slug, description, origin, price_cents, unit, stock, max_per_order, is_active, is_featured)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, cid, p.name, uniqueSlug(p.name), p.description, p.origin, p.price, p.unit, p.stock, p.max_per_order,
        p.is_active ? 1 : 0, p.is_featured ? 1 : 0);
        kept.add(Number(r.lastInsertRowid)); stats.created++;
      }
    }
    if (mode === 'remplacer') {
      for (const p of all('SELECT id, slug, image_url FROM products WHERE deleted_at IS NULL')) {
        if (kept.has(p.id)) continue;
        run('UPDATE products SET deleted_at = ?, is_active = 0, slug = ? WHERE id = ?', nowIso(), `${p.slug}-supprime-${p.id}`, p.id);
        if (p.image_url) removedImages.push(p.image_url);
        stats.removed++;
      }
    }
  });
  return { stats, removedImages };
}

const cell = (s) => { const t = String(s ?? ''); return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

/** Export du catalogue actuel (ou d'un modèle vide) — UTF-8 avec BOM et « ; » pour Excel en français. */
export function toCsv({ empty = false } = {}) {
  const head = COLUMNS.join(';');
  const rows = empty
    ? [['Pommes Belchard', 'Fruits & légumes', '3,40', '1 kg', '40', 'Normandie', 'Croquantes et acidulées.', 'oui', 'oui', '10'],
      ['Camembert de Normandie AOP', 'Produits frais', '4,20', '250 g', '24', "Pays d'Auge", '', 'non', 'oui', '']]
    : all(`SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id
           WHERE p.deleted_at IS NULL ORDER BY c.position, c.name, p.name`).map((p) => [p.name, p.category_name || '', (p.price_cents / 100).toFixed(2).replace('.', ','),
      p.unit, p.stock, p.origin, p.description, p.is_featured ? 'oui' : 'non', p.is_active ? 'oui' : 'non', p.max_per_order]);
  return '\ufeff' + [head, ...rows.map((r) => r.map(cell).join(';'))].join('\r\n') + '\r\n';
}
