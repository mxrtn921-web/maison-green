// Mises à jour des données déjà en production, exécutées une seule fois au démarrage (repérées dans settings).
import { one, all, run, tx, getSetting, setSetting } from './db.js';
import { slugify } from './lib/validate.js';

// Rayons de l'épicerie (ordre d'affichage). Un rayon sans produit en ligne n'apparaît pas dans la boutique.
export const CATEGORY_PLAN = [
  { name: 'Fruits & légumes', tone: 'sage', description: 'De saison, choisis chaque matin.' },
  { name: 'Boulangerie & viennoiseries', tone: 'sand', description: 'Pain, viennoiseries et brioches du jour.', from: [] },
  { name: 'Crèmerie & fromages', tone: 'sky', description: 'Lait, beurre, œufs, yaourts et fromages normands.', from: ['Produits frais'] },
  { name: 'Boucherie & charcuterie', tone: 'blush', description: 'Viandes, jambons et charcuterie.' },
  { name: 'Traiteur & plats cuisinés', tone: 'butter', description: 'Prêts à réchauffer, pour les soirs pressés.' },
  { name: 'Surgelés', tone: 'sky', description: 'Légumes, plats cuisinés et glaces.' },
  { name: 'Épicerie salée', tone: 'sand', description: 'Pâtes, riz, conserves, sauces et condiments.', from: ['Épicerie'] },
  { name: 'Sucré & petit-déjeuner', tone: 'blush', description: 'Pour bien commencer la journée.' },
  { name: 'Boissons', tone: 'butter', description: 'Eaux, jus, sodas et cidres.' },
  { name: 'Snacks & apéritif', tone: 'sand', description: "De quoi grignoter à l'heure de l'apéro." },
  { name: 'Hygiène & beauté', tone: 'stone', description: 'Savons, soins et essentiels de la salle de bain.' },
  { name: 'Entretien & maison', tone: 'stone', description: 'Lessive, vaisselle et produits ménagers.', from: ['Produits du quotidien'] },
];
// Produits d'exemple rangés dans les nouveaux rayons.
const MOVES = [['Jambon blanc à l’os', 'Boucherie & charcuterie'], ['Savon de Marseille', 'Hygiène & beauté'], ['Papier toilette', 'Hygiène & beauté']];

function categoriesV2() {
  const byName = (name) => one('SELECT id FROM categories WHERE name = ?', name);
  const uniqueSlug = (name, id) => { let s = slugify(name); let i = 2; while (one('SELECT 1 AS x FROM categories WHERE slug = ? AND id != ?', s, id)) s = `${slugify(name)}-${i++}`; return s; };
  CATEGORY_PLAN.forEach((c, position) => {
    let row = byName(c.name);
    if (!row) for (const old of c.from || []) { const o = byName(old); if (o) { row = o; break; } }
    if (row) run('UPDATE categories SET name = ?, slug = ?, description = ?, tone = ?, position = ? WHERE id = ?', c.name, uniqueSlug(c.name, row.id), c.description, c.tone, position, row.id);
    else run('INSERT INTO categories (name, slug, description, tone, position) VALUES (?, ?, ?, ?, ?)', c.name, uniqueSlug(c.name, 0), c.description, c.tone, position);
  });
  // Rayons créés à la main : placés après ceux du plan, dans leur ordre actuel.
  all('SELECT id FROM categories WHERE name NOT IN (' + CATEGORY_PLAN.map(() => '?').join(',') + ') ORDER BY position, id', ...CATEGORY_PLAN.map((c) => c.name))
    .forEach((c, i) => run('UPDATE categories SET position = ? WHERE id = ?', CATEGORY_PLAN.length + i, c.id));
  for (const [product, cat] of MOVES) run('UPDATE products SET category_id = (SELECT id FROM categories WHERE name = ?) WHERE name = ? AND deleted_at IS NULL', cat, product);
}

const MIGRATIONS = [['categories_v2', categoriesV2]];

export function runMigrations() {
  const done = new Set(getSetting('migrations', []));
  for (const [key, fn] of MIGRATIONS) {
    if (done.has(key)) continue;
    tx(fn);
    done.add(key);
    setSetting('migrations', [...done]);
    console.log(`  Mise à jour appliquée : ${key}`);
  }
}
