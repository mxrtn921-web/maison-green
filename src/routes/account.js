// Comptes clients : inscription, connexion, profil, adresses, RGPD. Pages légales.
import { get, post } from '../router.js';
import { sendHtml, redirect, setFlash, HttpError, send, clientIp, isBot } from '../lib/http.js';
import { one, all, run, tx, nowIso } from '../db.js';
import { validate, v } from '../lib/validate.js';
import { authenticate, startSession, endSession, hashPassword, verifyPassword, requireRole, rateLimit, resetRateLimit, revokeAllSessions } from '../auth.js';
import { loginPage, registerPage, accountOrdersPage, accountAddressesPage, accountProfilePage, accountDataPage, legalPage } from '../views/shop/account.js';
import { savedCards, removeCard } from '../services/payments.js';
import { stripeEnabled } from '../config.js';
import { LEGAL } from '../views/shop/legal-content.js';
import { shopInfo } from '../lib/shop.js';

const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)[\w\-/?=&.%]*$/.test(n) ? n : '');
const homeFor = (u) => (u.role === 'admin' ? '/admin' : u.role === 'driver' ? '/livreur' : '/compte');

get('/connexion', (ctx) => {
  if (ctx.user) return redirect(ctx.res, homeFor(ctx.user));
  sendHtml(ctx.res, loginPage(ctx, { next: safeNext(ctx.query.get('suite')) }));
});

post('/connexion', (ctx) => {
  const ip = clientIp(ctx.req);
  const email = String(ctx.body.email || '').slice(0, 160);
  const next = safeNext(ctx.body.suite);
  try { rateLimit(`login:${ip}`, 40); rateLimit(`login:${email.toLowerCase()}`, 8); }
  catch (e) { return sendHtml(ctx.res, loginPage(ctx, { errors: { form: e.message }, values: { email }, next }), 429); }
  const pwd = String(ctx.body.password || '');
  // Espace ajouté par un copier-coller ou le clavier du téléphone : on retente sans.
  const user = authenticate(email, pwd) || (pwd.trim() !== pwd ? authenticate(email, pwd.trim()) : null);
  if (!user) return sendHtml(ctx.res, loginPage(ctx, { errors: { form: 'E-mail ou mot de passe incorrect.' }, values: { email }, next }), 401);
  resetRateLimit(`login:${email.toLowerCase()}`);
  startSession(ctx.req, ctx.res, user.id);
  redirect(ctx.res, next || homeFor(user));
});

get('/inscription', (ctx) => {
  if (ctx.user) return redirect(ctx.res, homeFor(ctx.user));
  sendHtml(ctx.res, registerPage(ctx, { values: { email: ctx.query.get('email') || '' }, next: safeNext(ctx.query.get('suite')) }));
});

post('/inscription', (ctx) => {
  rateLimit(`register:${clientIp(ctx.req)}`, 10, 60 * 60e3);
  const next = safeNext(ctx.body.suite);
  if (isBot(ctx.body)) return sendHtml(ctx.res, registerPage(ctx, { errors: { form: 'Inscription refusée.' }, values: {}, next }), 422);
  const { data, errors } = validate({
    first_name: v.text({ label: 'Le prénom', max: 60 }), last_name: v.text({ label: 'Le nom', max: 60 }),
    email: v.email(), phone: v.phone({ required: false }), password: v.password(), marketing_opt_in: v.bool(), accept: v.bool(),
  }, ctx.body);
  if (!data.accept) errors.accept = 'Merci de confirmer avoir lu la politique de confidentialité.';
  if (!errors.email && one('SELECT 1 AS x FROM users WHERE email = ?', data.email)) errors.email = 'Un compte existe déjà avec cet e-mail. Connectez-vous.';
  if (Object.keys(errors).length) return sendHtml(ctx.res, registerPage(ctx, { errors, values: data, next }), 422);
  const id = tx(() => {
    const r = run("INSERT INTO users (email, password_hash, role, first_name, last_name, phone, marketing_opt_in) VALUES (?, ?, 'customer', ?, ?, ?, ?)",
      data.email, hashPassword(data.password), data.first_name, data.last_name, data.phone || '', data.marketing_opt_in ? 1 : 0);
    const uid = Number(r.lastInsertRowid);
    // Rattache les commandes passées sans compte avec le même e-mail.
    run('UPDATE orders SET user_id = ? WHERE user_id IS NULL AND email = ?', uid, data.email);
    return uid;
  });
  startSession(ctx.req, ctx.res, id);
  setFlash(ctx.res, 'success', `Bienvenue ${data.first_name} ! Votre compte est prêt.`);
  redirect(ctx.res, next || '/compte');
});

post('/deconnexion', (ctx) => { endSession(ctx.req, ctx.res); redirect(ctx.res, '/'); });

// ——— Espace client ——————————————————————————————————————————

get('/compte', (ctx) => {
  requireRole(ctx, 'customer');
  const orders = all(`SELECT o.*, (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS item_count FROM orders o WHERE o.user_id = ? ORDER BY o.id DESC LIMIT 50`, ctx.user.id)
    .map((o) => ({ ...o, items: all('SELECT product_id AS id, quantity AS qty FROM order_items WHERE order_id = ? AND product_id IS NOT NULL', o.id) }));
  sendHtml(ctx.res, accountOrdersPage(ctx, { orders }));
});

const addressSchema = {
  label: v.text({ label: 'Le nom', max: 40 }), line1: v.text({ label: "L'adresse", min: 4, max: 160 }),
  line2: v.text({ required: false, max: 160 }), postal_code: v.postal(), city: v.text({ label: 'La ville', max: 80 }),
  instructions: v.longText({ max: 300 }),
};
get('/compte/adresses', (ctx) => {
  requireRole(ctx, 'customer');
  sendHtml(ctx.res, accountAddressesPage(ctx, { addresses: all('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id', ctx.user.id) }));
});
post('/compte/adresses', (ctx) => {
  requireRole(ctx, 'customer');
  const { data, errors, ok } = validate(addressSchema, ctx.body);
  if (!ok) return sendHtml(ctx.res, accountAddressesPage(ctx, { addresses: all('SELECT * FROM addresses WHERE user_id = ?', ctx.user.id), errors, values: data }), 422);
  const count = one('SELECT COUNT(*) AS n FROM addresses WHERE user_id = ?', ctx.user.id).n;
  if (count >= 10) throw new HttpError(422, 'Vous avez atteint le maximum de 10 adresses.');
  run('INSERT INTO addresses (user_id, label, line1, line2, postal_code, city, instructions, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ctx.user.id, data.label, data.line1, data.line2, data.postal_code, data.city, data.instructions, count ? 0 : 1);
  setFlash(ctx.res, 'success', 'Adresse enregistrée.');
  redirect(ctx.res, '/compte/adresses');
});
post('/compte/adresses/:id/defaut', (ctx) => {
  requireRole(ctx, 'customer');
  tx(() => {
    run('UPDATE addresses SET is_default = 0 WHERE user_id = ?', ctx.user.id);
    run('UPDATE addresses SET is_default = 1 WHERE id = ? AND user_id = ?', Number(ctx.params.id), ctx.user.id);
  });
  redirect(ctx.res, '/compte/adresses');
});
post('/compte/adresses/:id/supprimer', (ctx) => {
  requireRole(ctx, 'customer');
  run('DELETE FROM addresses WHERE id = ? AND user_id = ?', Number(ctx.params.id), ctx.user.id);
  setFlash(ctx.res, 'success', 'Adresse supprimée.');
  redirect(ctx.res, '/compte/adresses');
});

get('/compte/profil', async (ctx) => {
  requireRole(ctx, 'customer');
  sendHtml(ctx.res, accountProfilePage(ctx, { cards: await savedCards(ctx.user), stripeOn: stripeEnabled() }));
});
post('/compte/profil', async (ctx) => {
  requireRole(ctx, 'customer');
  const { data, errors, ok } = validate({ first_name: v.text({ label: 'Le prénom', max: 60 }), last_name: v.text({ label: 'Le nom', max: 60 }), phone: v.phone({ required: false }) }, ctx.body);
  if (!ok) return sendHtml(ctx.res, accountProfilePage(ctx, { errors, cards: [], stripeOn: stripeEnabled() }), 422);
  run('UPDATE users SET first_name = ?, last_name = ?, phone = ? WHERE id = ?', data.first_name, data.last_name, data.phone || '', ctx.user.id);
  setFlash(ctx.res, 'success', 'Profil mis à jour.');
  redirect(ctx.res, '/compte/profil');
});
post('/compte/mot-de-passe', async (ctx) => {
  requireRole(ctx, 'customer');
  const u = one('SELECT password_hash FROM users WHERE id = ?', ctx.user.id);
  const errors = {};
  if (!verifyPassword(String(ctx.body.current || ''), u.password_hash)) errors.current = 'Mot de passe actuel incorrect.';
  const [pw, pwErr] = v.password()(ctx.body.password);
  if (pwErr) errors.password = pwErr;
  if (Object.keys(errors).length) return sendHtml(ctx.res, accountProfilePage(ctx, { errors, cards: [], stripeOn: stripeEnabled() }), 422);
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(pw), ctx.user.id);
  revokeAllSessions(ctx.user.id);
  startSession(ctx.req, ctx.res, ctx.user.id);
  setFlash(ctx.res, 'success', 'Mot de passe modifié. Vos autres appareils ont été déconnectés.');
  redirect(ctx.res, '/compte/profil');
});
post('/compte/cartes/:id/supprimer', async (ctx) => {
  requireRole(ctx, 'customer');
  await removeCard(ctx.user, ctx.params.id);
  setFlash(ctx.res, 'success', 'Carte retirée.');
  redirect(ctx.res, '/compte/profil');
});

// RGPD : portabilité et effacement
get('/compte/donnees', (ctx) => { requireRole(ctx, 'customer'); sendHtml(ctx.res, accountDataPage(ctx)); });
get('/compte/donnees/export', (ctx) => {
  requireRole(ctx, 'customer');
  const uid = ctx.user.id;
  const data = {
    exported_at: nowIso(),
    profile: one('SELECT email, first_name, last_name, phone, marketing_opt_in, created_at FROM users WHERE id = ?', uid),
    addresses: all('SELECT label, line1, line2, postal_code, city, instructions FROM addresses WHERE user_id = ?', uid),
    orders: all('SELECT id, number, status, created_at, first_name, last_name, email, phone, address_line1, address_line2, postal_code, city, instructions, slot_date, slot_start, slot_end, subtotal_cents, delivery_fee_cents, total_cents, payment_method, payment_status FROM orders WHERE user_id = ?', uid)
      .map((o) => ({ ...o, items: all('SELECT name, unit, unit_price_cents, quantity, line_total_cents FROM order_items WHERE order_id = ?', o.id) })),
  };
  send(ctx.res, 200, JSON.stringify(data, null, 2), 'application/json; charset=utf-8', { 'Content-Disposition': 'attachment; filename="maison-green-mes-donnees.json"', 'Cache-Control': 'no-store' });
});
post('/compte/supprimer', (ctx) => {
  requireRole(ctx, 'customer');
  const u = one('SELECT password_hash FROM users WHERE id = ?', ctx.user.id);
  if (!verifyPassword(String(ctx.body.password || ''), u.password_hash)) {
    setFlash(ctx.res, 'error', 'Mot de passe incorrect : compte non supprimé.');
    return redirect(ctx.res, '/compte/donnees');
  }
  const uid = ctx.user.id;
  tx(() => {
    // Les commandes sont conservées (obligation comptable) mais anonymisées.
    run(`UPDATE orders SET first_name = 'Client', last_name = 'supprimé', email = 'anonyme@invalid', phone = '', address_line1 = 'Adresse supprimée',
         address_line2 = '', instructions = '', user_id = NULL WHERE user_id = ?`, uid);
    run('DELETE FROM addresses WHERE user_id = ?', uid);
    run('DELETE FROM sessions WHERE user_id = ?', uid);
    run('DELETE FROM notifications WHERE user_id = ?', uid);
    run(`UPDATE users SET email = ?, first_name = 'Compte', last_name = 'supprimé', phone = '', password_hash = 'deleted', stripe_customer_id = NULL,
         is_active = 0, deleted_at = ? WHERE id = ?`, `deleted-${uid}@invalid`, nowIso(), uid);
  });
  endSession(ctx.req, ctx.res);
  setFlash(ctx.res, 'success', 'Votre compte a été supprimé. Merci d’avoir fait vos courses chez nous.');
  redirect(ctx.res, '/');
});

// ——— Pages légales ——————————————————————————————————————————
// Valeurs du Kbis utilisées tant que les champs correspondants ne sont pas remplis dans l'admin.
const LEGAL_DEFAULTS = {
  legal_name: 'MOAN', legal_form: 'société par actions simplifiée (SAS)', legal_capital: '200', legal_siren: '988 836 037', legal_siret: '988 836 037 00016',
  legal_rcs: 'Rouen', legal_tva: '', legal_manager: 'Mourad Djelassi', legal_siege: '27 rue du Général Leclerc, 76000 Rouen',
  legal_mediator: '',
};
const fillLegal = (text) => {
  const s = shopInfo();
  const val = (k) => (s[k] && String(s[k]).trim()) || LEGAL_DEFAULTS[k] || '';
  const raison = val('legal_name') === 'Maison Green' ? LEGAL_DEFAULTS.legal_name : val('legal_name');
  const editeur = `${raison}, ${val('legal_form')}${val('legal_capital') ? ` au capital de ${val('legal_capital')} €` : ''}, immatriculée au RCS de ${val('legal_rcs')} sous le numéro ${val('legal_siren')}${val('legal_siren').replace(/\s/g, '') === '988836037' ? ` (SIRET ${LEGAL_DEFAULTS.legal_siret})` : ''}, exploitant l’enseigne Maison Green, dont le siège social est situé ${val('legal_siege')}.`;
  const mediateur = val('legal_mediator') || 'médiateur en cours de désignation, ses coordonnées seront publiées sur cette page';
  if (text.includes('{tva}') && !val('legal_tva')) return '';
  return text.replaceAll('{editeur}', editeur).replaceAll('{siege}', val('legal_siege')).replaceAll('{etablissement}', s.fullAddress)
    .replaceAll('{tva}', val('legal_tva')).replaceAll('{gerant}', val('legal_manager')).replaceAll('{mediateur}', mediateur)
    .replaceAll('{adresse}', s.fullAddress).replaceAll('{email}', s.email).replaceAll('{contact}', [s.email, s.phone].filter(Boolean).join(' · '));
};
for (const [path, page] of Object.entries(LEGAL)) {
  get(path, (ctx) => sendHtml(ctx.res, legalPage(ctx, { ...page, sections: page.sections.map(([h, ps]) => [h, ps.map(fillLegal).filter(Boolean)]) })));
}
