// Données de démonstration : catalogue réaliste, zones de Rouen, horaires, comptes et historique de commandes.
// Usage : npm run seed (si la base est vide) · npm run reset (repart de zéro)
import fs from 'node:fs';
import crypto from 'node:crypto';
import { config } from './config.js';

if (process.argv.includes('--reset')) {
  for (const f of [config.dbFile, `${config.dbFile}-wal`, `${config.dbFile}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
}

const { one, all, run, tx, setSetting } = await import('./db.js');
const { hashPassword } = await import('./auth.js');
const { slugify } = await import('./lib/validate.js');
const { parisNow, addDays, parisToUtc } = await import('./lib/time.js');

export const DEMO_ACCOUNTS = {
  admin: { email: 'admin@maisongreen.fr', password: process.env.ADMIN_PASSWORD || 'MaisonGreen-2026' },
  driver: { email: 'lucas@maisongreen.fr', password: 'Livreur-2026' },
  customer: { email: 'thomas.martin@exemple.fr', password: 'Client-2026' },
};

const CATEGORIES = [
  ['Fruits & légumes', 'sage', 'De saison, choisis chaque matin.'],
  ['Produits frais', 'sky', 'Crèmerie normande, œufs, charcuterie.'],
  ['Épicerie', 'sand', 'Les bases du placard, bien choisies.'],
  ['Sucré & petit-déjeuner', 'blush', 'Pour bien commencer la journée.'],
  ['Boissons', 'butter', 'Eaux, jus, cidres et softs.'],
  ['Snacks & apéritif', 'sand', "De quoi grignoter à l'heure de l'apéro."],
  ['Produits du quotidien', 'stone', 'Entretien et hygiène, sans mauvaise surprise.'],
];

// [nom, rayon, prix €, unité, origine, description, stock, vedette]
const PRODUCTS = [
  ['Pommes Belchard', 0, 3.4, '1 kg', 'Normandie', 'Croquantes, acidulées juste ce qu’il faut. Du verger de la famille Lemaître, près de Jumièges.', 42, 1],
  ['Poires Conférence', 0, 3.9, '1 kg', 'Val de Loire', 'Chair fondante et sucrée. À laisser mûrir un jour ou deux à température ambiante.', 25, 0],
  ['Bananes', 0, 2.49, '1 kg', 'Équateur', 'Bananes issues de l’agriculture biologique.', 30, 0],
  ['Citrons jaunes', 0, 2.2, '500 g', 'Espagne', 'Non traités après récolte : le zeste s’utilise sans crainte.', 20, 0],
  ['Avocats Hass', 0, 2.9, 'lot de 2', 'Pérou', 'Prêts à déguster sous 2 jours.', 16, 0],
  ['Tomates grappe', 0, 2.6, '500 g', 'France', 'Parfumées, idéales en salade ou rôties au four.', 22, 0],
  ['Carottes des sables', 0, 1.9, '1 kg', 'Créances, Manche', 'Cultivées dans le sable de la côte ouest du Cotentin. Sucrées et tendres.', 35, 1],
  ['Poireaux', 0, 2.3, 'la botte', 'Normandie', 'Pour une fondue, une soupe ou une quiche.', 14, 0],
  ['Salade feuille de chêne', 0, 1.5, 'pièce', 'Seine-Maritime', 'Maraîcher de Saint-Pierre-lès-Elbeuf.', 12, 0],
  ['Pommes de terre Ratte', 0, 3.2, '1 kg', 'Picardie', 'Petite, fondante, au léger goût de noisette.', 18, 0],
  ['Camembert de Normandie AOP', 1, 4.2, '250 g', 'Pays d’Auge', 'Au lait cru, moulé à la louche. Affiné à cœur en 4 semaines.', 24, 1],
  ['Neufchâtel AOP', 1, 3.9, '200 g', 'Pays de Bray', 'Le plus ancien fromage de Normandie, en forme de cœur.', 10, 0],
  ['Beurre demi-sel d’Isigny', 1, 3.6, '250 g', 'Isigny-sur-Mer', 'Beurre AOP baratté, aux cristaux de sel de Guérande.', 30, 1],
  ['Crème fraîche d’Isigny', 1, 2.9, '20 cl', 'Isigny-sur-Mer', 'Crème crue épaisse AOP.', 18, 0],
  ['Lait entier', 1, 1.45, '1 L', 'Normandie', 'Lait de pâturage, microfiltré.', 40, 0],
  ['Œufs plein air', 1, 2.8, 'boîte de 6', 'Seine-Maritime', 'Poules élevées en plein air, calibre moyen.', 28, 1],
  ['Yaourts nature fermiers', 1, 2.6, 'pack de 4', 'Normandie', 'Au lait entier, en pots de verre consignés.', 16, 0],
  ['Jambon blanc à l’os', 1, 4.9, '4 tranches', 'France', 'Cuit au torchon, sans nitrite ajouté.', 12, 0],
  ['Rigatoni', 2, 2.1, '500 g', 'Italie', 'Pâtes de blé dur tréfilées au bronze, séchées lentement.', 45, 0],
  ['Riz basmati', 2, 3.2, '1 kg', 'Inde', 'Grains longs et parfumés.', 30, 0],
  ['Huile d’olive vierge extra', 2, 8.9, '50 cl', 'Andalousie', 'Première pression à froid, fruitée et légèrement ardente.', 14, 1],
  ['Sauce tomate au basilic', 2, 2.7, '400 g', 'Italie', 'Tomates cuisinées lentement, basilic frais.', 26, 0],
  ['Lentilles vertes', 2, 2.4, '500 g', 'Auvergne', 'Petites et fines, elles tiennent à la cuisson.', 20, 0],
  ['Moutarde de Dijon', 2, 1.9, '210 g', 'Bourgogne', 'Forte, comme il se doit.', 22, 0],
  ['Thon albacore à l’huile d’olive', 2, 3.8, '160 g', 'Bretagne', 'Pêché à la ligne, mis en boîte à Douarnenez.', 18, 0],
  ['Confiture de fraises', 3, 4.5, '370 g', 'Normandie', 'Cuite au chaudron, 65 % de fruits.', 12, 0],
  ['Miel de fleurs', 3, 6.9, '250 g', 'Forêt de Roumare', 'Récolté à 10 km de la boutique. Crémeux.', 9, 1],
  ['Sablés normands au beurre', 3, 3.2, '125 g', 'Normandie', 'Pur beurre d’Isigny, recette de 1905.', 20, 0],
  ['Chocolat noir 70 %', 3, 2.9, '100 g', 'Pérou', 'Notes de fruits rouges, finale longue.', 25, 0],
  ['Granola avoine & noisette', 3, 4.8, '350 g', 'France', 'Cuit au four, peu sucré.', 14, 0],
  ['Café en grains', 3, 6.5, '250 g', 'Brûlerie rouennaise', 'Moka d’Éthiopie torréfié rue Eau-de-Robec.', 16, 1],
  ['Coca-Cola', 4, 2.5, '1,5 L', '', 'La bouteille familiale.', 17, 0],
  ['Eau minérale plate', 4, 3.4, '6 × 1,5 L', 'France', 'Pack de six bouteilles.', 20, 0],
  ['Cidre brut fermier', 4, 4.9, '75 cl', 'Pays d’Auge', 'Cidre fermier, bulles fines, peu sucré. À servir frais.', 24, 1],
  ['Jus de pomme artisanal', 4, 3.6, '1 L', 'Normandie', 'Pur jus, non filtré, pressé à la ferme.', 20, 0],
  ['Eau pétillante', 4, 1.1, '1 L', 'France', 'Fines bulles.', 30, 0],
  ['Limonade artisanale', 4, 3.2, '75 cl', 'Normandie', 'Au citron pressé, peu sucrée.', 11, 0],
  ['Chips au sel de Guérande', 5, 2.2, '125 g', 'France', 'Cuites au chaudron, à l’huile de tournesol.', 26, 0],
  ['Olives vertes Lucques', 5, 4.2, '200 g', 'Languedoc', 'Charnues et douces.', 10, 0],
  ['Houmous', 5, 2.9, '200 g', 'France', 'Pois chiches, tahini, citron.', 12, 0],
  ['Crackers à l’épeautre', 5, 2.6, '150 g', 'France', 'Croustillants, graines de sésame.', 15, 0],
  ['Cacahuètes grillées', 5, 1.9, '200 g', '', 'Légèrement salées.', 20, 0],
  ['Papier toilette', 6, 3.9, 'lot de 6', 'France', 'Recyclé, doux, sans parfum.', 24, 0],
  ['Liquide vaisselle', 6, 2.9, '500 ml', 'France', 'Écologique, parfum citron.', 18, 0],
  ['Lessive liquide', 6, 7.9, '1,5 L', 'France', '30 lavages, sans allergènes.', 10, 0],
  ['Savon de Marseille', 6, 3.5, '300 g', 'Marseille', '72 % d’huiles végétales.', 14, 0],
  ['Éponges', 6, 1.8, 'lot de 3', '', 'Double face.', 22, 0],
  ['Sacs poubelle 30 L', 6, 2.4, 'rouleau de 20', '', 'Avec liens coulissants.', 16, 0],
];

const ZONES = [
  ['Rouen centre', '76000', 2.99, 15, 60, 30],
  ['Rouen rive gauche & plateaux', '76100, 76130, 76230, 76420', 3.99, 20, 75, 40],
  ['Agglomération', '76120, 76140, 76160, 76250, 76300, 76800', 4.99, 30, null, 50],
];

export function seed({ demo = !config.isProd } = {}) {
  if (config.isProd && !process.env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD est obligatoire pour créer le compte administrateur en production.');
  if (one('SELECT COUNT(*) AS n FROM users').n > 0) { console.log('La base contient déjà des données. Utilisez « npm run reset » pour repartir de zéro.'); return false; }
  tx(() => {
    CATEGORIES.forEach(([name, tone, desc], i) => run('INSERT INTO categories (name, slug, description, tone, position) VALUES (?, ?, ?, ?, ?)', name, slugify(name), desc, tone, i));
    const catIds = CATEGORIES.map(([name]) => one('SELECT id FROM categories WHERE slug = ?', slugify(name)).id);
    for (const [name, c, price, unit, origin, desc, stock, featured] of PRODUCTS) {
      run('INSERT INTO products (category_id, name, slug, description, origin, price_cents, unit, stock, is_featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        catIds[c], name, slugify(name), desc, origin, Math.round(price * 100), unit, stock, featured);
    }
    ZONES.forEach(([name, codes, fee, min, free, eta], i) => run('INSERT INTO delivery_zones (name, postal_codes, fee_cents, min_order_cents, free_over_cents, eta_minutes, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
      name, codes, Math.round(fee * 100), min * 100, free ? free * 100 : null, eta, i));
    for (let wd = 0; wd < 7; wd++) {
      const sunday = wd === 0;
      run('INSERT INTO opening_hours (weekday, is_open, opens_at, closes_at) VALUES (?, 1, ?, ?)', wd, sunday ? '09:30' : '09:00', sunday ? '13:00' : '20:00');
      const slots = sunday ? [['10:00', '11:00'], ['11:00', '12:00'], ['12:00', '13:00']]
        : [['10:00', '11:00'], ['11:00', '12:00'], ['12:00', '13:00'], ['17:00', '18:00'], ['18:00', '19:00'], ['19:00', '20:00']];
      for (const [s, e] of slots) run('INSERT INTO delivery_slots (weekday, starts_at, ends_at, capacity) VALUES (?, ?, ?, ?)', wd, s, e, 6);
    }
    run("INSERT INTO closures (date, label) VALUES ('2026-12-25', 'Noël'), ('2027-01-01', 'Jour de l’an')");
    setSetting('shop', { name: 'Maison Green', address: '42 rue de la République', postal: '76000', city: 'Rouen', phone: '', email: 'bonjour@maisongreen.fr' });
    setSetting('shop_email', 'bonjour@maisongreen.fr');
    setSetting('lead_time_minutes', 45);
    setSetting('orders_paused', false);

    const A = DEMO_ACCOUNTS;
    run("INSERT INTO users (email, password_hash, role, first_name, last_name, phone) VALUES (?, ?, 'admin', 'Camille', 'Green', '02 35 00 00 00')", A.admin.email, hashPassword(A.admin.password));
    if (!demo) return; // production : catalogue, zones, horaires et compte admin uniquement
    for (const [first, last, email, phone, vehicle] of [['Lucas', 'Moreau', A.driver.email, '06 11 22 33 44', 'Vélo cargo'], ['Inès', 'Benali', 'ines@maisongreen.fr', '06 55 66 77 88', 'Scooter électrique']]) {
      const r = run("INSERT INTO users (email, password_hash, role, first_name, last_name, phone) VALUES (?, ?, 'driver', ?, ?, ?)", email, hashPassword(first === 'Lucas' ? A.driver.password : 'Livreur-2026'), first, last, phone);
      run('INSERT INTO drivers (user_id, vehicle) VALUES (?, ?)', Number(r.lastInsertRowid), vehicle);
    }
    const c = run("INSERT INTO users (email, password_hash, role, first_name, last_name, phone) VALUES (?, ?, 'customer', 'Thomas', 'Martin', '06 12 34 56 78')", A.customer.email, hashPassword(A.customer.password));
    run("INSERT INTO addresses (user_id, label, line1, line2, postal_code, city, instructions, is_default) VALUES (?, 'Domicile', '18 rue Beauvoisine', 'Appartement 24, 3e étage', '76000', 'Rouen', 'Sonner chez Martin, code 4521B', 1)", Number(c.lastInsertRowid));
    sampleOrders(Number(c.lastInsertRowid));
  });
  return true;
}

// ——— Historique de démonstration ————————————————————————————————
function sampleOrders(customerId) {
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const P = all('SELECT id, name, unit, price_cents FROM products');
  const lucas = one("SELECT id FROM users WHERE email = 'lucas@maisongreen.fr'").id;
  const ines = one("SELECT id FROM users WHERE email = 'ines@maisongreen.fr'").id;
  const people = [['Thomas', 'Martin', '18 rue Beauvoisine', '76000', customerId], ['Sophie', 'Leroy', '5 place du Vieux-Marché', '76000'], ['Karim', 'Haddad', '42 avenue de Bretagne', '76100'],
    ['Julie', 'Petit', '9 rue de la République', '76000'], ['Antoine', 'Roussel', '27 rue du Mont-Riboudet', '76000'], ['Nadia', 'Cherif', '3 allée des Tilleuls', '76130'],
    ['Paul', 'Lefebvre', '61 route de Neufchâtel', '76230'], ['Emma', 'Garnier', '14 rue Saint-Romain', '76000'], ['Hugo', 'Dubois', '8 rue Lafayette', '76100'], ['Léa', 'Fontaine', '120 rue Jean-Jaurès', '76300']];
  const zones = all('SELECT * FROM delivery_zones');
  const zoneFor = (cp) => zones.find((z) => z.postal_codes.includes(cp));
  const today = parisNow().date;
  const slots = [['10:00', '11:00'], ['11:00', '12:00'], ['12:00', '13:00'], ['17:00', '18:00'], ['18:00', '19:00'], ['19:00', '20:00']];

  const make = ({ daysAgo, status, driver = null, method = null, slot = null }) => {
    const [first, last, addr, cp, uid = null] = pick(people);
    const zone = zoneFor(cp);
    const date = addDays(today, -daysAgo);
    const [ss, se] = slot || pick(slots);
    const n = 2 + Math.floor(rnd() * 6);
    const lines = []; const used = new Set();
    for (let i = 0; i < n; i++) { const p = pick(P); if (used.has(p.id)) continue; used.add(p.id); lines.push({ p, q: 1 + Math.floor(rnd() * 3) }); }
    let sub = lines.reduce((t, l) => t + l.p.price_cents * l.q, 0);
    if (sub < zone.min_order_cents) { const p = P.find((x) => x.price_cents > 600); lines.push({ p, q: Math.ceil((zone.min_order_cents - sub) / p.price_cents) + 1 }); sub = lines.reduce((t, l) => t + l.p.price_cents * l.q, 0); }
    const fee = zone.free_over_cents && sub >= zone.free_over_cents ? 0 : zone.fee_cents;
    const total = sub + fee;
    const pm = method || (rnd() < 0.62 ? 'card' : 'cash');
    const created = new Date(parisToUtc(date, ss).getTime() - (40 + Math.floor(rnd() * 180)) * 60e3).toISOString();
    const delivered = status === 'delivered';
    let payStatus = pm === 'card' ? 'paid' : delivered ? 'paid' : 'due_on_delivery';
    if (status === 'cancelled') payStatus = pm === 'card' ? 'refunded' : 'cancelled';
    const token = crypto.randomBytes(18).toString('base64url');
    const dId = driver ?? (delivered ? (rnd() < 0.55 ? lucas : ines) : null);
    const deliveredAt = delivered ? new Date(parisToUtc(date, ss).getTime() + (10 + Math.floor(rnd() * 40)) * 60e3).toISOString() : null;
    const r = run(`INSERT INTO orders (number, tracking_token, user_id, status, first_name, last_name, email, phone, address_line1, postal_code, city, instructions, zone_id, zone_name,
      slot_date, slot_start, slot_end, subtotal_cents, delivery_fee_cents, total_cents, payment_method, payment_status, cash_to_collect_cents, cash_collected_at, cash_remitted_at,
      driver_id, picked_up_at, delivered_at, created_at, updated_at, cancel_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      `TMP-${token}`, token, uid, status, first, last, `${first.toLowerCase()}.${last.toLowerCase()}@exemple.fr`, `06 ${String(10 + Math.floor(rnd() * 89))} ${String(10 + Math.floor(rnd() * 89))} ${String(10 + Math.floor(rnd() * 89))} ${String(10 + Math.floor(rnd() * 89))}`,
      addr, cp, cp === '76300' ? 'Sotteville-lès-Rouen' : cp === '76130' ? 'Mont-Saint-Aignan' : cp === '76230' ? 'Bois-Guillaume' : 'Rouen',
      pick(['', '', 'Sonner à l’interphone', 'Déposer devant la porte', 'Code 1234A, 2e étage', 'Appeler en arrivant']),
      zone.id, zone.name, date, ss, se, sub, fee, total, pm, payStatus, pm === 'cash' && status !== 'cancelled' ? total : 0,
      pm === 'cash' && delivered ? deliveredAt : null, pm === 'cash' && delivered && daysAgo > 0 ? deliveredAt : null,
      dId, ['out_for_delivery', 'delivered'].includes(status) || (status === 'assigned' && rnd() < 0.5) ? created : null, deliveredAt, created, created,
      status === 'cancelled' ? pick(['Client absent, injoignable', 'Annulée à la demande du client', 'Rupture de stock']) : null);
    const id = Number(r.lastInsertRowid);
    run('UPDATE orders SET number = ? WHERE id = ?', `MG-${1000 + id}`, id);
    for (const l of lines) run('INSERT INTO order_items (order_id, product_id, name, unit, unit_price_cents, quantity, line_total_cents) VALUES (?, ?, ?, ?, ?, ?, ?)', id, l.p.id, l.p.name, l.p.unit, l.p.price_cents, l.q, l.p.price_cents * l.q);
    run('INSERT INTO payments (order_id, provider, status, amount_cents, refunded_cents) VALUES (?, ?, ?, ?, ?)', id, pm === 'card' ? 'demo' : 'cash', payStatus, total, payStatus === 'refunded' ? total : 0);
    const flow = ['received', 'confirmed', 'preparing', 'ready', 'assigned', 'out_for_delivery', 'delivered'];
    const upto = status === 'cancelled' ? 1 : flow.indexOf(status);
    let t = new Date(created).getTime();
    for (let i = 0; i <= upto; i++) { run('INSERT INTO order_events (order_id, status, label, created_at) VALUES (?, ?, ?, ?)', id, flow[i], '', new Date(t).toISOString()); t += (4 + Math.floor(rnd() * 12)) * 60e3; }
    if (status === 'cancelled') run('INSERT INTO order_events (order_id, status, label, created_at) VALUES (?, ?, ?, ?)', id, 'cancelled', 'Commande annulée', new Date(t).toISOString());
    return id;
  };

  for (let d = 13; d >= 1; d--) {
    const count = 2 + Math.floor(rnd() * 5);
    for (let i = 0; i < count; i++) make({ daysAgo: d, status: rnd() < 0.08 ? 'cancelled' : 'delivered' });
  }
  // Aujourd'hui : un flux réaliste de commandes en cours.
  const now = parisNow();
  const h = Math.min(Math.max(now.minutes, 11 * 60), 19 * 60);
  const slotAt = (offset) => { const m = Math.min(19 * 60, Math.max(10 * 60, Math.floor((h + offset) / 60) * 60)); const hh = String(m / 60).padStart(2, '0'); return [`${hh}:00`, `${String(m / 60 + 1).padStart(2, '0')}:00`]; };
  make({ daysAgo: 0, status: 'delivered', slot: slotAt(-120) });
  make({ daysAgo: 0, status: 'delivered', slot: slotAt(-60), method: 'cash', driver: lucas });
  make({ daysAgo: 0, status: 'out_for_delivery', driver: lucas, method: 'cash', slot: slotAt(0) });
  make({ daysAgo: 0, status: 'assigned', driver: ines, slot: slotAt(0) });
  make({ daysAgo: 0, status: 'ready', slot: slotAt(60) });
  make({ daysAgo: 0, status: 'preparing', slot: slotAt(60) });
  make({ daysAgo: 0, status: 'confirmed', method: 'cash', slot: slotAt(120) });
  make({ daysAgo: 0, status: 'received', slot: slotAt(120) });
}

// Exécution directe : npm run seed / npm run reset
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  if (seed()) {
    console.log('\n  Base de démonstration créée.\n');
    console.log(`  Administration : ${DEMO_ACCOUNTS.admin.email} / ${DEMO_ACCOUNTS.admin.password}`);
    console.log(`  Livreur        : ${DEMO_ACCOUNTS.driver.email} / ${DEMO_ACCOUNTS.driver.password}`);
    console.log(`  Client         : ${DEMO_ACCOUNTS.customer.email} / ${DEMO_ACCOUNTS.customer.password}\n`);
  }
}
