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

// Livraisons de 18h à 2h du matin, tous les jours, par créneaux d'une heure.
// 00h – 01h et 01h – 02h sont rattachés à la soirée de la veille dans la boutique.
export const DELIVERY_HOURS = ['18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00'];
function deliverySlots18to2() {
  const capacity = one('SELECT MAX(capacity) AS c FROM delivery_slots')?.c || 6;
  run('DELETE FROM delivery_slots');
  for (let wd = 0; wd < 7; wd++) {
    for (const start of DELIVERY_HOURS) {
      const end = `${String((Number(start.slice(0, 2)) + 1) % 24).padStart(2, '0')}:00`;
      run('INSERT INTO delivery_slots (weekday, starts_at, ends_at, capacity) VALUES (?, ?, ?, ?)', wd, start, end, capacity);
    }
  }
}

// Rayons à sous-rayons : chaque sous-rayon s'affiche à l'intérieur de son rayon (ex. Alcools › Whisky).
// Un rayon parent absent est créé seulement si au moins un de ses sous-rayons existe.
const RAYONS = [
  { name: 'Alcools', tone: 'butter', children: ['Whisky', 'Vodka', 'Rhum', 'Gin', 'Tequila', 'Cognac & calvados', 'Pastis', 'Liqueurs & apéritifs', 'Champagne & mousseux', 'Vin rouge', 'Vin blanc', 'Vin rosé', 'Bières', 'Canettes alcoolisées'] },
  { name: 'Boissons', tone: 'butter', children: ['Boissons énergisantes'] },
  { name: 'Épicerie', tone: 'sand', description: 'Épicerie salée et sucrée, snacks, confiseries, café et thé.', children: ['Épicerie salée', 'Épicerie sucrée', 'Biscuits apéro', 'Snacks salés', 'Confiseries', 'Café & thé', 'Produits frais'] },
  { name: 'Vape', tone: 'stone', description: 'Puffs, cigarettes électroniques et e-liquides.', children: ['Puffs et cigarettes électroniques', 'E-liquides'] },
  { name: 'Hygiène & beauté', tone: 'stone', children: ['Hygiène'] },
  { name: 'Maison', tone: 'stone', description: 'Entretien et animalerie.', children: ['Entretien', 'Animalerie'] },
];
function rayonsParents() {
  const byName = (name) => one('SELECT * FROM categories WHERE name = ?', name);
  for (const r of RAYONS) {
    const kids = r.children.map(byName).filter(Boolean);
    if (!kids.length) continue;
    let parent = byName(r.name);
    if (!parent) {
      let slug = slugify(r.name); let i = 2; while (one('SELECT 1 AS x FROM categories WHERE slug = ?', slug)) slug = `${slugify(r.name)}-${i++}`;
      const pos = Math.min(...kids.map((k) => k.position));
      const age = kids.some((k) => k.age_restricted) ? 1 : 0;
      const notice = kids.find((k) => k.legal_notice)?.legal_notice || '';
      run('INSERT INTO categories (name, slug, description, tone, position, age_restricted, legal_notice) VALUES (?, ?, ?, ?, ?, ?, ?)', r.name, slug, r.description || '', r.tone, pos, age, notice);
      parent = byName(r.name);
    }
    for (const k of kids) if (k.id !== parent.id) run('UPDATE categories SET parent_id = ? WHERE id = ?', parent.id, k.id);
  }
}

const MIGRATIONS = [['categories_v2', categoriesV2], ['delivery_slots_18_02', deliverySlots18to2], ['rayons_parents_v1', rayonsParents]];

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
