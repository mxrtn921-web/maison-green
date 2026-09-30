// Tests de bout en bout (serveur réel, base temporaire). Lancer : npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
const DB = path.join(os.tmpdir(), `mg-test-${Date.now()}.db`);
const WEBHOOK_SECRET = 'whsec_test_123';
let server;

before(async () => {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DATABASE_FILE: DB, BASE_URL: BASE, STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, RESEND_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('en ligne')) resolve(); }));
});
after(() => { server.kill(); for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) fs.rmSync(f, { force: true }); });

/** Petit client HTTP avec cookies (comme un navigateur). */
function client() {
  const jar = new Map();
  const req = async (method, url, { form, json, multipart, headers = {} } = {}) => {
    const h = { Origin: BASE, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...headers };
    let body;
    if (form) { h['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    if (json) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (multipart) body = multipart;
    const r = await fetch(BASE + url, { method, headers: h, body, redirect: 'manual' });
    for (const c of r.headers.getSetCookie()) { const [kv] = c.split(';'); const [k, ...v] = kv.split('='); jar.set(k, v.join('=')); }
    const text = await r.text();
    let data = null; try { data = JSON.parse(text); } catch { /* HTML */ }
    return { status: r.status, location: r.headers.get('location'), text, data };
  };
  return {
    get: (u, o) => req('GET', u, o), post: (u, o) => req('POST', u, o),
    login: async (email, password) => { const r = await req('POST', '/connexion', { form: { email, password } }); assert.equal(r.status, 303, 'connexion refusée'); return r; },
  };
}

const firstSlot = async (c) => {
  const html = (await c.get('/commande')).text;
  return /name="slot" id="[^"]+" value="([^"]+)" >/.exec(html)?.[1] || /value="(\d{4}-\d{2}-\d{2}\|\d{2}:\d{2})"/.exec(html)[1];
};
const checkout = (slot, extra = {}) => ({
  first_name: 'Test', last_name: 'Client', email: 'test@exemple.fr', phone: '06 12 34 56 78', address_line1: '10 rue Jeanne d’Arc',
  postal_code: '76000', city: 'Rouen', instructions: 'Code 1234', slot, payment_method: 'card', accept_terms: true,
  items: [{ id: 1, qty: 3 }, { id: 21, qty: 2 }], ...extra,
});
// Commande payée par carte (mode démo) : renvoie le jeton de suivi.
const placePaidOrder = async (c, extra = {}) => {
  const r = await c.post('/api/orders', { json: checkout(await firstSlot(c), extra) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.match(r.data.redirect, /paiement-demo/);
  const token = r.data.redirect.split('/').pop();
  await c.post(`/paiement-demo/${token}`, { form: { result: 'success' } });
  return token;
};
const productStock = async (admin, id) => Number(/name="stock" type="number" min="0" value="(\d+)"/.exec((await admin.get(`/admin/produits/${id}`)).text)[1]);

test('pages publiques accessibles', async () => {
  const c = client();
  for (const u of ['/', '/boutique', '/boutique?q=cidre', '/produit/cidre-brut-fermier', '/commande', '/cgv', '/confidentialite', '/mentions-legales', '/connexion']) {
    assert.equal((await c.get(u)).status, 200, u);
  }
  assert.equal((await c.get('/nexiste-pas')).status, 404);
});

test('les prix du panier sont recalculés par le serveur', async () => {
  const r = await client().post('/api/cart/quote', { json: { items: [{ id: 1, qty: 2, price: 1 }], postal_code: '76000' } });
  assert.equal(r.data.lines[0].unit_price_cents, 340);
  assert.equal(r.data.subtotal, 680);
  assert.equal(r.data.zone.fee, 299);
});

test('validation de commande : erreurs lisibles par champ', async () => {
  const c = client();
  const r = await c.post('/api/orders', { json: { items: [{ id: 1, qty: 1 }], postal_code: '99999', phone: '12' } });
  assert.equal(r.status, 422);
  assert.ok(r.data.errors.first_name && r.data.errors.phone && r.data.errors.postal_code && r.data.errors.accept_terms);
});

test('parcours complet carte : client → livreur → livrée, sans espèces', async () => {
  const c = client(); const admin = client(); const driver = client();
  await admin.login('admin@maisongreen.fr', 'MaisonGreen-2026');
  await driver.login('lucas@maisongreen.fr', 'Livreur-2026');
  const stockBefore = await productStock(admin, 1);
  // les espèces ne sont plus proposées ni acceptées
  const co = (await c.get('/commande')).text;
  assert.doesNotMatch(co, /value="cash"/); assert.doesNotMatch(co, /Espèces/);
  const refused = await c.post('/api/orders', { json: checkout(await firstSlot(c), { payment_method: 'cash' }) });
  assert.equal(refused.status, 422);
  assert.ok(refused.data.errors.payment_method);
  const token = await placePaidOrder(c);
  assert.equal(await productStock(admin, 1), stockBefore - 3, 'stock décrémenté');

  const track = await c.get(`/suivi/${token}`);
  const number = /Commande (MG-\d+)/.exec(track.text)[1];
  const id = Number(number.slice(3)) - 1000;
  assert.doesNotMatch(track.text, /espèces/i);

  // confirmée automatiquement : aucune action de la boutique, la course est proposée aux livreurs
  assert.match((await c.get(`/suivi/${token}`)).text, /Commande confirmée/);
  assert.match((await driver.get('/livreur?onglet=disponibles')).text, new RegExp(number));
  const notes = (await driver.get('/api/notifications')).data;
  assert.equal(notes[0].kind, 'delivery_available');
  assert.equal(notes[0].order_id, id);
  // toucher l'alerte ouvre la course (lien de la notification) : page affichée avec Accepter / Refuser
  assert.equal(notes[0].link, `/livreur/courses/${id}`);
  const fromPush = await driver.get(notes[0].link);
  assert.equal(fromPush.status, 200);
  assert.match(fromPush.text, /Accepter/); assert.match(fromPush.text, /Refuser/);
  const sw = await driver.get('/sw.js');
  assert.equal(sw.status, 200); assert.match(sw.text, /pending-nav/);
  // le livreur accepte depuis la notification (bouton « Accepter »)
  const acc = await driver.post(`/api/livreur/courses/${id}/accept`, { json: {} });
  assert.equal(acc.status, 200, JSON.stringify(acc.data));
  assert.equal(acc.data.ok, true);
  assert.doesNotMatch((await driver.get('/livreur?onglet=disponibles')).text, new RegExp(number));
  // plus jamais de page 404 : la course acceptée s'ouvre, une URL d'action ouverte en GET renvoie vers la course
  assert.equal((await driver.get(`/livreur/courses/${id}`)).status, 200);
  assert.equal((await driver.get(`/livreur/courses/${id}/accept`)).location, `/livreur/courses/${id}`);
  // formulaire « Accepter » de la page : retour sur la course (200), pas d'erreur
  const otherToken = await placePaidOrder(c);
  const otherId = Number((await c.get(`/suivi/${otherToken}`)).text.match(/MG-(\d+)/)[1]) - 1000;
  const acc2 = await driver.post(`/livreur/courses/${otherId}/accept`, { form: {} });
  assert.equal(acc2.location, `/livreur/courses/${otherId}`);
  assert.equal((await driver.get(acc2.location)).status, 200);
  // une course introuvable ou annulée renvoie vers la liste avec un message
  assert.equal((await driver.get('/livreur/courses/999999')).location, '/livreur');
  await admin.post(`/admin/commandes/${otherId}/statut`, { form: { status: 'cancelled', reason: 'Test' } });
  const run = (await driver.get(`/livreur/courses/${id}`)).text;
  assert.doesNotMatch(run, /À encaisser/); assert.match(run, /payée par carte/);
  assert.match(run, /google\.com\/maps/); assert.match(run, /maps\.apple\.com/);
  for (const a of ['pickup', 'start', 'deliver']) assert.equal((await driver.post(`/livreur/courses/${id}/${a}`)).status, 303);
  const done = (await c.get(`/suivi/${token}`)).text;
  assert.match(done, /Livrée/);

  // aucun livreur disponible : commande impossible, et une vente payée entre-temps est annulée + remboursée
  const pending = await c.post('/api/orders', { json: checkout(await firstSlot(c)) });
  assert.equal(pending.status, 201, JSON.stringify(pending.data));
  const pendingToken = pending.data.redirect.split('/').pop();
  const ines = (await admin.get('/admin/livreurs')).text.split('<tr').find((row) => row.includes('Inès'));
  const inesId = /\/admin\/livreurs\/(\d+)\/activer/.exec(ines)[1];
  const setLucas = (on) => driver.post('/livreur/disponibilite', { form: on ? { available: '1' } : {} });
  await admin.post(`/admin/livreurs/${inesId}/activer`); // Inès désactivée
  await setLucas(false);                                   // Lucas en pause
  try {
    assert.match((await c.get('/commande')).text, /Aucun livreur n(&#39;|&#x27;|')est disponible/);
    const refused = await c.post('/api/orders', { json: checkout(await firstSlot(c)) });
    assert.equal(refused.status, 422);
    assert.match(refused.data.message, /Aucun livreur/);
    await c.post(`/paiement-demo/${pendingToken}`, { form: { result: 'success' } });
    let page = '';
    for (let i = 0; i < 40; i++) { page = (await c.get(`/suivi/${pendingToken}`)).text; if (/rembours/i.test(page)) break; await new Promise((w) => setTimeout(w, 50)); }
    assert.match(page, /Aucun livreur disponible/);
    assert.match(page, /rembours/i);
  } finally {
    await setLucas(true);
    await admin.post(`/admin/livreurs/${inesId}/activer`); // Inès réactivée
  }
  assert.equal((await c.post('/api/orders', { json: checkout(await firstSlot(c)) })).status, 201, 'les commandes reprennent');
});

test('paiement carte (démo) : échec, nouvel essai, succès, remboursement', async () => {
  const c = client(); const admin = client();
  await admin.login('admin@maisongreen.fr', 'MaisonGreen-2026');
  const r = await c.post('/api/orders', { json: checkout(await firstSlot(c), { payment_method: 'card' }) });
  assert.match(r.data.redirect, /paiement-demo/);
  const token = r.data.redirect.split('/').pop();
  await c.post(`/paiement-demo/${token}`, { form: { result: 'failure' } });
  assert.match((await c.get(`/suivi/${token}`)).text, /paiement a été refusé/);
  const retry = await c.post(`/suivi/${token}/payer`);
  assert.match(retry.location, /paiement-demo/);
  await c.post(`/paiement-demo/${token}`, { form: { result: 'success' } });
  const page = (await c.get(`/suivi/${token}`)).text;
  assert.match(page, /Commande confirmée/);
  const id = Number(/Commande MG-(\d+)/.exec(page)[1]) - 1000;
  await admin.post(`/admin/commandes/${id}/rembourser`, { form: { amount: '2,00' } });
  assert.match((await admin.get(`/admin/commandes/${id}`)).text, /Partiellement remboursée/);
  const stockBefore = await productStock(admin, 21);
  await admin.post(`/admin/commandes/${id}/statut`, { form: { status: 'cancelled', reason: 'Test' } });
  const detail = (await admin.get(`/admin/commandes/${id}`)).text;
  assert.match(detail, /Remboursée/);
  assert.equal(await productStock(admin, 21), stockBefore + 2, 'stock remis en rayon');
});

test('le livreur refuse une course payée par carte : commande annulée et client remboursé', async () => {
  const c = client(); const admin = client(); const driver = client();
  await admin.login('admin@maisongreen.fr', 'MaisonGreen-2026');
  await driver.login('lucas@maisongreen.fr', 'Livreur-2026');
  const r = await c.post('/api/orders', { json: checkout(await firstSlot(c), { payment_method: 'card' }) });
  const token = r.data.redirect.split('/').pop();
  await c.post(`/paiement-demo/${token}`, { form: { result: 'success' } });
  const id = Number(/Commande MG-(\d+)/.exec((await c.get(`/suivi/${token}`)).text)[1]) - 1000;
  const run = (await driver.get(`/livreur/courses/${id}`)).text;
  assert.match(run, /Accepter la course/); assert.match(run, /Refuser/);
  const res = await driver.post(`/api/livreur/courses/${id}/refuse`, { json: {} });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const detail = (await admin.get(`/admin/commandes/${id}`)).text;
  assert.match(detail, /Annulée/);
  assert.match(detail, /Remboursée/);
  assert.match(detail, /Refusée par le livreur/);
  // une course refusée ne peut plus être acceptée
  assert.equal((await driver.post(`/api/livreur/courses/${id}/accept`, { json: {} })).status, 409);
});

test('webhook Stripe : signature vérifiée', async () => {
  const c = client();
  const body = JSON.stringify({ id: 'evt_1', type: 'ping', data: { object: {} } });
  const bad = await c.post('/api/stripe/webhook', { headers: { 'Stripe-Signature': 't=1,v1=00', 'Content-Type': 'application/json', Origin: '' }, json: undefined });
  assert.equal(bad.status, 400);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
  const r = await fetch(`${BASE}/api/stripe/webhook`, { method: 'POST', headers: { 'Stripe-Signature': `t=${t},v1=${sig}`, 'Content-Type': 'application/json' }, body });
  assert.equal(r.status, 200);
});

test('sécurité : rôles, CSRF, mots de passe', async () => {
  const anon = client(); const cust = client(); const driver = client();
  assert.equal((await anon.get('/admin')).status, 303, 'anonyme redirigé vers la connexion');
  await cust.login('thomas.martin@exemple.fr', 'Client-2026');
  assert.equal((await cust.get('/admin')).status, 403);
  assert.equal((await cust.get('/livreur')).status, 403);
  await driver.login('lucas@maisongreen.fr', 'Livreur-2026');
  assert.equal((await driver.get('/admin/commandes')).status, 403);
  // requête venant d'un autre site
  const csrf = await cust.post('/compte/profil', { form: { first_name: 'Pirate', last_name: 'X' }, headers: { Origin: 'https://evil.example' } });
  assert.equal(csrf.status, 403);
  const bad = await client().post('/connexion', { form: { email: 'admin@maisongreen.fr', password: 'mauvais' } });
  assert.equal(bad.status, 401);
});

test('inscription, adresse, export RGPD, suppression', async () => {
  const c = client();
  const email = `new${Date.now()}@exemple.fr`;
  const r = await c.post('/inscription', { form: { first_name: 'Nina', last_name: 'Roy', email, phone: '', password: 'motdepasse-solide', accept: 'on' } });
  assert.equal(r.status, 303);
  await c.post('/compte/adresses', { form: { label: 'Maison', line1: '3 rue Ganterie', postal_code: '76000', city: 'Rouen' } });
  const exp = await c.get('/compte/donnees/export');
  assert.equal(exp.data.profile.email, email);
  assert.equal(exp.data.addresses.length, 1);
  await c.post('/compte/supprimer', { form: { password: 'motdepasse-solide' } });
  assert.equal((await client().post('/connexion', { form: { email, password: 'motdepasse-solide' } })).status, 401);
});

test('admin : produit, catégorie, zone, créneau, pause des commandes', async () => {
  const admin = client();
  await admin.login('admin@maisongreen.fr', 'MaisonGreen-2026');
  const p = await admin.post('/admin/produits/nouveau', { form: { name: 'Coca-Cola Zéro', price: '2,50', unit: '1,5 L', stock: '17', max_per_order: '10', category_id: '5', description: 'Test', is_active: 'on' } });
  assert.equal(p.status, 303);
  assert.match((await client().get('/boutique?q=coca zero')).text, /Coca-Cola Zéro/);
  await admin.post('/admin/categories', { form: { name: 'Surgelés', tone: 'sky' } });
  assert.match((await admin.get('/admin/categories')).text, /Surgelés/);
  const z = await admin.post('/admin/zones', { form: { name: 'Zone test', postal_codes: '76000', fee: '1', min_order: '1', eta_minutes: '30' } });
  assert.equal(z.status, 422, 'code postal déjà utilisé refusé');
  await admin.post('/admin/zones', { form: { name: 'Elbeuf', postal_codes: '76500', fee: '6,99', min_order: '40', eta_minutes: '60' } });
  assert.equal((await client().get('/api/zone?cp=76500')).data.fee, 699);
  await admin.post('/admin/horaires/reglages', { form: { orders_paused: 'on', pause_message: 'Inventaire en cours', lead_time_minutes: '45' } });
  const c = client();
  assert.match((await c.get('/')).text, /Inventaire en cours/);
  const blocked = await c.post('/api/orders', { json: checkout('2099-01-01|10:00') });
  assert.equal(blocked.status, 422);
  await admin.post('/admin/horaires/reglages', { form: { pause_message: 'x', lead_time_minutes: '45' } });
});

test('admin : import et export du catalogue en CSV', async () => {
  const admin = client();
  await admin.login('admin@maisongreen.fr', 'MaisonGreen-2026');
  assert.equal((await client().get('/admin/produits/import')).status, 303, 'page protégée');
  assert.equal((await admin.get('/admin/produits/import')).status, 200);
  const exp = await admin.get('/admin/produits/export.csv');
  assert.match(exp.text, /^\uFEFF?nom;rayon;prix/);
  assert.match(exp.text, /Pommes Belchard;Fruits & légumes;3,40;1 kg/);

  const upload = (csv, mode = 'maj', filename = 'catalogue.csv') => {
    const fd = new FormData();
    fd.append('mode', mode);
    fd.append('fichier', new Blob([csv], { type: 'text/csv' }), filename);
    return admin.post('/admin/produits/import', { multipart: fd });
  };
  // erreurs : rien n'est importé, lignes signalées
  const bad = await upload('Nom;Catégorie;Prix\nPain;Boulangerie;abc\n;Boulangerie;2\n');
  assert.equal(bad.status, 422);
  assert.match(bad.text, /Ligne 2 \(Pain\)/);
  assert.match(bad.text, /Ligne 3/);
  assert.match((await upload('a;b\n1;2', 'maj', 'x.xlsx')).text, /classeur/);

  // remplacement complet (Windows-1252, séparateur « ; », guillemets)
  const csv = 'nom;rayon;prix;format;stock;origine;description;vedette\r\n'
    + 'Baguette tradition;Boulangerie;1,30;pièce;50;Rouen;"Farine Label Rouge; cuite sur place";oui\r\n'
    + 'Pommes Belchard;Fruits & légumes;3,60 €;1 kg;;Normandie;;\r\n';
  const prev = await upload(Buffer.from(csv.replace('€', '\x80'), 'latin1'), 'remplacer');
  assert.equal(prev.status, 200);
  assert.match(prev.text, /2 produits/);
  assert.match(prev.text, /stock non renseigné/);
  const token = /name="token" value="([a-f0-9]+)"/.exec(prev.text)[1];
  const done = await admin.post('/admin/produits/import', { form: { token } });
  assert.equal(done.status, 303);
  assert.equal((await admin.post('/admin/produits/import', { form: { token } })).status, 303, 'jeton à usage unique');
  const after = (await admin.get('/admin/produits/export.csv')).text.trim().split('\r\n');
  assert.equal(after.length, 3, after.join('\n'));
  assert.match(after.join('\n'), /Baguette tradition;Boulangerie;1,30;pièce;50;Rouen;"Farine Label Rouge; cuite sur place";oui;oui;20/);
  assert.match(after.join('\n'), /Pommes Belchard;Fruits & légumes;3,60;1 kg;0/);
  const shop = (await client().get('/boutique')).text;
  assert.match(shop, /Baguette tradition/);
  assert.doesNotMatch(shop, /Camembert/);
});

test('admin : coordonnées de la boutique affichées sur le site et les pages légales', async () => {
  const admin = client();
  await admin.login('admin@maisongreen.fr', 'MaisonGreen-2026');
  const home = (await client().get('/')).text;
  assert.match(home, /42 rue de la République/);
  assert.doesNotMatch(home, /Gros-Horloge|02 35 00 00 00/);
  assert.equal((await admin.post('/admin/boutique', { form: { address: '42 rue de la République', postal: '76000', city: 'Rouen', phone: '0235123456', email: 'contact@maisongreen.fr' } })).status, 303);
  assert.equal((await admin.post('/admin/boutique', { form: { address: '', postal: '7600', city: 'Rouen', phone: '', email: 'x' } })).status, 422);
  const legal = (await client().get('/mentions-legales')).text;
  assert.match(legal, /42 rue de la République, 76000 Rouen/);
  assert.match(legal, /contact@maisongreen\.fr · 02 35 12 34 56/);
  assert.match((await client().get('/')).text, /href="tel:0235123456"/);
  assert.equal((await client().post('/admin/boutique', { form: { address: 'x' } })).status, 303, 'réservé à l’admin');
  // informations légales saisies dans l'admin → mentions légales et CGV complétées, prénom de l'admin modifié
  assert.match(legal, /\[à compléter\]/);
  assert.equal((await admin.post('/admin/boutique/legal', { form: { legal_name: 'Maison Green', legal_form: 'SARL', legal_capital: '5000', legal_siren: '123 456 789', legal_rcs: 'Rouen', legal_tva: 'FR12123456789', legal_manager: 'Karim Test', legal_mediator: 'CM2C, www.cm2c.net', first_name: 'Karim', last_name: 'Test' } })).status, 303);
  const legal2 = (await client().get('/mentions-legales')).text;
  assert.match(legal2, /Maison Green, SARL au capital de 5000 €, immatriculée sous le numéro 123 456 789 \(RCS Rouen\)/);
  assert.match(legal2, /FR12123456789/); assert.match(legal2, /Karim Test/);
  assert.doesNotMatch(legal2, /\[à compléter\]/);
  assert.match((await client().get('/cgv')).text, /CM2C, www\.cm2c\.net/);
  assert.match((await admin.get('/admin')).text, /Bonjour Karim/);
  assert.equal((await client().post('/admin/boutique/legal', { form: { first_name: 'x' } })).status, 303, 'réservé à l’admin');
});

test('rayons de l’épicerie et chiffre d’affaires annuel', async () => {
  const admin = client();
  await admin.login('admin@maisongreen.fr', 'MaisonGreen-2026');
  const cats = (await admin.get('/admin/categories')).text;
  for (const name of ['Boulangerie &amp; viennoiseries', 'Crèmerie &amp; fromages', 'Boucherie &amp; charcuterie', 'Surgelés', 'Hygiène &amp; beauté', 'Entretien &amp; maison']) assert.match(cats, new RegExp(name));
  assert.doesNotMatch(cats, /value="Produits frais"/);
  // un rayon vide n'apparaît pas dans la boutique
  assert.doesNotMatch((await client().get('/boutique')).text, /Surgelés/);

  assert.equal((await client().get('/admin/chiffre-affaires')).status, 303, 'réservé à l’admin');
  const year = new Date().getFullYear();
  const page = await admin.get('/admin/chiffre-affaires');
  assert.equal(page.status, 200);
  assert.match(page.text, new RegExp(`Chiffre d'affaires ${year}`));
  assert.match(page.text, /Décembre/);
  const csv = await admin.get(`/admin/chiffre-affaires/export.csv?annee=${year}`);
  assert.equal(csv.status, 200);
  const lines = csv.text.trim().split('\r\n');
  assert.match(lines[0], /^\uFEFF?Numéro;Date;Heure;Client/);
  assert.ok(lines.length > 5, 'les commandes de démonstration sont exportées');
  assert.match(lines[1], /^MG-\d+;\d{2}\/\d{2}\/\d{4};\d{2}:\d{2};/);
});

test('alertes push livreur (VAPID signé) et sauvegarde de la base', async () => {
  const http = await import('node:http');
  const hits = [];
  const fake = http.createServer((req, res) => { const chunks = []; req.on('data', (d) => chunks.push(d)); req.on('end', () => { hits.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) }); res.writeHead(201); res.end(); }); });
  await new Promise((r) => fake.listen(0, r));
  const pushUrl = `http://localhost:${fake.address().port}`;
  const admin = client();
  await admin.login('admin@maisongreen.fr', 'MaisonGreen-2026');
  try {
    const driver = client();
    await driver.login('lucas@maisongreen.fr', 'Livreur-2026');
    assert.equal((await client().get('/api/push/key')).status === 200, false, 'clé réservée à l’équipe');
    const { data } = await driver.get('/api/push/key');
    assert.equal(Buffer.from(data.key, 'base64url').length, 65);
    assert.equal((await driver.post('/api/push/subscribe', { json: { endpoint: 'ftp://pirate' } })).status, 422);
    // clés du « téléphone » (comme un vrai navigateur) pour pouvoir déchiffrer l'alerte
    const phone = crypto.createECDH('prime256v1'); const phonePub = phone.generateKeys(); const phoneAuth = crypto.randomBytes(16);
    assert.equal((await driver.post('/api/push/subscribe', { json: { endpoint: `${pushUrl}/push/lucas`, keys: { p256dh: phonePub.toString('base64url'), auth: phoneAuth.toString('base64url') } } })).status, 200);

    // nouvelle commande, confirmée par la boutique → les livreurs sont alertés
    const id = Number(/href="\/admin\/produits\/(\d+)"[^>]*>Baguette tradition/.exec((await admin.get('/admin/produits')).text)[1]);
    const c = client();
    const r = await c.post('/api/orders', { json: checkout(await firstSlot(c), { items: [{ id, qty: 15 }] }) });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const orderId = Number((await c.get(r.data.redirect)).text.match(/MG-(\d+)/)[1]) - 1000;
    await c.post(r.data.redirect, { form: { result: 'success' } }); // paiement carte (démo)
    // aucune confirmation manuelle : l'alerte part dès la commande
    for (let i = 0; i < 40 && !hits.length; i++) await new Promise((w) => setTimeout(w, 50));
    assert.equal(hits.length, 1, 'une alerte push envoyée au livreur');
    assert.equal(hits[0].url, '/push/lucas');
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(hits[0].headers.authorization);
    const [h, claims, sig] = m[1].split('.');
    const pub = Buffer.from(m[2], 'base64url');
    const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url') }, format: 'jwk' });
    assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${claims}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')), 'signature VAPID valide');
    assert.equal(JSON.parse(Buffer.from(claims, 'base64url')).aud, pushUrl);
    // contenu chiffré dans l'alerte (RFC 8291) : le téléphone l'affiche sans appeler le site
    assert.equal(hits[0].headers['content-encoding'], 'aes128gcm');
    const b = hits[0].body;
    const salt = b.subarray(0, 16); const idlen = b[20]; const asPub = b.subarray(21, 21 + idlen); const ct = b.subarray(21 + idlen);
    const hk = (ikm, sl, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, sl, info, len));
    const ikm = hk(phone.computeSecret(asPub), phoneAuth, Buffer.concat([Buffer.from('WebPush: info\0'), phonePub, asPub]), 32);
    const dec = crypto.createDecipheriv('aes-128-gcm', hk(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16), hk(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
    dec.setAuthTag(ct.subarray(ct.length - 16));
    const plain = Buffer.concat([dec.update(ct.subarray(0, ct.length - 16)), dec.final()]);
    assert.equal(plain[plain.length - 1], 2);
    const msg = JSON.parse(plain.subarray(0, -1).toString());
    assert.equal(msg.kind, 'delivery_available');
    assert.equal(msg.order_id, orderId);
    assert.equal(msg.link, `/livreur/courses/${orderId}`);
    assert.match(msg.title, /Nouvelle course MG-/);
    assert.match(msg.body, /Accepter ou refuser/);
    const notes = (await driver.get('/api/notifications')).data;
    assert.match(notes[0].title, /Nouvelle course MG-/);
  } finally { fake.close(); }

  // sauvegarde téléchargeable par l'admin uniquement
  assert.equal((await client().get('/admin/sauvegarde')).status, 303);
  const backup = await admin.get('/admin/sauvegarde');
  assert.equal(backup.status, 200);
  assert.ok(backup.text.startsWith('SQLite format 3'), 'fichier SQLite complet');
  assert.match((await admin.get('/admin/horaires')).text, /Dernière :/);
});

test('admin : nouveau mot de passe pour un livreur', async () => {
  const admin = client(); const driver = client();
  await admin.login('admin@maisongreen.fr', 'MaisonGreen-2026');
  await driver.login('ines@maisongreen.fr', 'Livreur-2026');
  const id = Number(/ines@maisongreen\.fr[\s\S]*?\/admin\/livreurs\/(\d+)\/mot-de-passe/.exec((await admin.get('/admin/livreurs')).text)[1]);
  const r = await admin.post(`/admin/livreurs/${id}/mot-de-passe`);
  assert.equal(r.status, 303, 'redirection : rafraîchir la page ne recrée pas de mot de passe');
  const shown = (await admin.get(r.location)).text;
  const pwd = /ines@maisongreen\.fr<\/strong> \/ <strong>([a-f0-9-]+)<\/strong>/.exec(shown)[1];
  assert.doesNotMatch((await admin.get(r.location)).text, new RegExp(pwd), 'affiché une seule fois');
  assert.equal((await driver.get('/livreur')).status, 303, 'ancienne session déconnectée');
  assert.equal((await client().post('/connexion', { form: { email: 'ines@maisongreen.fr', password: 'Livreur-2026' } })).status, 401, 'ancien mot de passe refusé');
  await client().login('ines@maisongreen.fr', `${pwd} `); // espace en trop toléré
  assert.equal((await client().post(`/admin/livreurs/${id}/mot-de-passe`)).status, 303, 'réservé à l’admin');
});

test('rayons réservés aux majeurs (alcool, CBD) : case 18 ans obligatoire et contrôle d’âge signalé', async () => {
  const admin = client(); await admin.login('admin@maisongreen.fr', 'MaisonGreen-2026');
  // menu mobile de l'admin : toutes les rubriques présentes
  const dash = (await admin.get('/admin')).text;
  assert.match(dash, /<details class="mobile-nav">/); assert.match(dash, /mobile-nav[\s\S]*\/admin\/livreurs[\s\S]*<\/details>/);
  assert.equal((await admin.post('/admin/categories', { form: { name: 'Alcools', description: 'Vins, bières et spiritueux', tone: 'butter', age_restricted: 'on', legal_notice: 'L’abus d’alcool est dangereux pour la santé, à consommer avec modération.' } })).status, 303);
  const cats = (await admin.get('/admin/categories')).text;
  const catId = /action="\/admin\/categories\/(\d+)"[^>]*>[\s\S]{0,400}value="Alcools"/.exec(cats)[1];
  const form = new FormData();
  for (const [k, val] of Object.entries({ name: 'Cidre test 18+', category_id: catId, price: '4,50', unit: '75 cl', stock: '20', max_per_order: '10', is_active: 'on' })) form.set(k, val);
  const created = await admin.post('/admin/produits/nouveau', { multipart: form });
  assert.equal(created.status, 303, created.text.slice(0, 300));
  const pid = Number(/\/admin\/produits\/(\d+)/.exec(created.location)?.[1] || /\/produit\/([\w-]+)/.exec(created.location)?.[1]);
  const shop = client();
  const product = (await shop.get('/boutique?q=Cidre%20test')).text;
  const id = Number(/data-add="(\d+)"[\s\S]{0,600}?Cidre test 18\+|Cidre test 18\+[\s\S]{0,600}?data-add="(\d+)"/.exec(product)?.slice(1).find(Boolean) || pid);
  const quote = (await shop.post('/api/cart/quote', { json: { items: [{ id, qty: 4 }] } })).data;
  assert.equal(quote.adult, true);
  const base = checkout(await firstSlot(shop), { items: [{ id, qty: 4 }] });
  const refused = await shop.post('/api/orders', { json: base });
  assert.equal(refused.status, 422); assert.ok(refused.data.errors.adult_ok);
  const ok = await shop.post('/api/orders', { json: { ...base, adult_ok: true } });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  const orderId = Number((await shop.get(ok.data.redirect)).text.match(/MG-(\d+)/)[1]) - 1000;
  assert.match((await admin.get(`/admin/commandes/${orderId}`)).text, /Contrôle d'âge obligatoire/);
  const page = (await shop.get(`/boutique?categorie=alcools`)).text;
  assert.match(page, /Vente interdite aux mineurs/); assert.match(page, /consommer avec modération/);
});

test('variantes : une seule fiche « Nom » avec le choix des formats', async () => {
  const admin = client(); await admin.login('admin@maisongreen.fr', 'MaisonGreen-2026');
  const csv = 'nom;rayon;prix;format;stock\nAmnesia test — 1 g;CBD test;7,00;1 g;10\nAmnesia test — 5 g;CBD test;30,00;5 g;10\nAmnesia test — 10 g;CBD test;56,00;10 g;0\n';
  const fd = new FormData(); fd.set('mode', 'maj'); fd.set('fichier', new Blob([csv], { type: 'text/csv' }), 'v.csv');
  const prev = await admin.post('/admin/produits/import', { multipart: fd });
  const token = /name="token" value="([^"]+)"/.exec(prev.text)[1];
  assert.equal((await admin.post('/admin/produits/import', { form: { token } })).status, 303);
  const c = client();
  const shop = (await c.get('/boutique?categorie=cbd-test')).text;
  assert.equal((shop.match(/class="product-name"/g) || []).length, 1, 'une seule carte pour les 3 formats');
  assert.match(shop, /Amnesia test<\/a>/); assert.match(shop, /1 g · 5 g · 10 g/); assert.match(shop, /dès<\/span> 7,00/);
  assert.match(shop, /CBD test <span class="n">1<\/span>/);
  const slug = /href="\/produit\/([^"]+)"/.exec(shop)[1];
  const page = (await c.get(`/produit/${slug}`)).text;
  assert.match(page, /<h1 class="h1">Amnesia test<\/h1>/);
  assert.equal((page.match(/class="variant /g) || []).length + (page.match(/class="variant"/g) || []).length, 3);
  assert.match(page, /aria-current="true"[\s\S]{0,200}1 g/); assert.match(page, /épuisé/);
  const five = /href="\/produit\/([^"]+)"[^>]*>\s*<span class="v-label">5 g/.exec(page)[1];
  const p5 = (await c.get(`/produit/${five}`)).text;
  assert.match(p5, /pdp-price">30,00/);
});

test('qualité du site : CGU, sitemap, robots, compression, favicon, anti-spam, statistiques anonymes', async () => {
  const c = client();
  // pages légales et référencement
  const cgu = await c.get('/cgu'); assert.equal(cgu.status, 200); assert.match(cgu.text, /Conditions générales d’utilisation/);
  assert.match((await c.get('/')).text, /href="\/cgu"/);
  const robots = await c.get('/robots.txt'); assert.equal(robots.status, 200);
  assert.match(robots.text, /Disallow: \/admin/); assert.match(robots.text, new RegExp(`Sitemap: ${BASE}/sitemap.xml`));
  const sm = await c.get('/sitemap.xml'); assert.equal(sm.status, 200);
  assert.match(sm.text, /<urlset/);
  const slug = /\/produit\/([a-z0-9-]+)</.exec(sm.text)[1]; assert.doesNotMatch(sm.text, /\/admin/);
  assert.equal((await c.get('/favicon.ico')).status, 200);
  // compression gzip des pages et fichiers, cache long des fichiers versionnés
  const home = await fetch(`${BASE}/`, { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(home.headers.get('content-encoding'), 'gzip');
  const cssUrl = /\/css\/app\.css\?v=\w+/.exec(await home.text())[0];
  const css = await fetch(BASE + cssUrl, { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(css.headers.get('content-encoding'), 'gzip'); assert.match(css.headers.get('cache-control'), /immutable/);
  // un seul bouton principal en haut de l'accueil
  const hero = /<div class="hero-cta">([\s\S]*?)<\/div>/.exec((await c.get('/')).text)[1];
  assert.equal((hero.match(/class="btn /g) || []).length, 1);
  // anti-spam : champ piège présent et bloquant
  assert.match((await c.get('/commande')).text, /name="website"/);
  const bot = await c.post('/api/orders', { json: checkout(await firstSlot(c), { website: 'http://spam.example' }) });
  assert.equal(bot.status, 422);
  assert.equal((await c.post('/inscription', { form: { first_name: 'Bot', last_name: 'Bot', email: 'bot@spam.example', password: 'motdepasse-123', accept: 'on', website: 'x' } })).status, 422);
  // statistiques anonymes : visiteurs et pages vues comptés, robots et pages privées ignorés, aucune donnée personnelle
  const browser = { Accept: 'text/html', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148', Referer: 'https://www.instagram.com/' };
  for (const u of ['/', '/boutique', `/produit/${slug}`]) await c.get(u, { headers: browser });
  await c.get('/', { headers: { ...browser, 'User-Agent': 'Googlebot/2.1' } });
  await c.get('/compte', { headers: browser });
  const admin = client(); await admin.login('admin@maisongreen.fr', 'MaisonGreen-2026');
  const stats = (await admin.get('/admin/statistiques?jours=7')).text;
  assert.match(stats, /Visiteurs<\/span><span class="k-value">1</);
  assert.match(stats, /Pages vues<\/span><span class="k-value">3</);
  assert.match(stats, /Instagram/); assert.match(stats, /Mobile/); assert.match(stats, /Produit : /);
  assert.equal((await client().get('/admin/statistiques')).status, 303, 'réservé à l’admin');
});

test('remise à zéro avant l’ouverture (dernier test : efface les commandes)', async () => {
  const admin = client();
  await admin.login('admin@maisongreen.fr', 'MaisonGreen-2026');
  assert.match((await admin.get('/admin/horaires')).text, /Remise à zéro avant l'ouverture/);
  assert.equal((await client().post('/admin/remise-a-zero', { form: { confirm: 'EFFACER' } })).status, 303, 'réservé à l’admin');
  const before = (await admin.get('/admin/chiffre-affaires/export.csv')).text.trim().split('\r\n').length;
  assert.ok(before > 2);
  await admin.post('/admin/remise-a-zero', { form: { confirm: 'oui' } });
  assert.equal((await admin.get('/admin/chiffre-affaires/export.csv')).text.trim().split('\r\n').length, before, 'sans confirmation, rien n’est effacé');
  assert.equal((await admin.post('/admin/remise-a-zero', { form: { confirm: 'effacer', customers: '1' } })).status, 303);
  assert.equal((await admin.get('/admin/chiffre-affaires/export.csv')).text.trim().split('\r\n').length, 1, 'plus aucune commande');
  assert.match((await client().get('/boutique')).text, /Pommes Belchard|Baguette/, 'le catalogue est conservé');
  // la numérotation repart à MG-1001
  const id = Number(/href="\/admin\/produits\/(\d+)"[^>]*>Baguette tradition/.exec((await admin.get('/admin/produits')).text)[1]);
  const c = client();
  const r = await c.post('/api/orders', { json: checkout(await firstSlot(c), { items: [{ id, qty: 15 }] }) });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.match((await c.get(r.data.redirect)).text, /MG-1001/);
});
