// Maison Green — serveur HTTP (Node.js ≥ 22.13, sans dépendance externe).
import http from 'node:http';
import path from 'node:path';
import { config, ROOT, stripeEnabled } from './src/config.js';
import { track } from './src/services/analytics.js';
import { run, one } from './src/db.js';
import { match } from './src/router.js';
import { readBody, serveStatic, sendJson, sendHtml, redirect, takeFlash, HttpError, clientIp } from './src/lib/http.js';
import { currentUser } from './src/auth.js';
import { expireUnpaidOrders } from './src/services/orders.js';
import { errorPage } from './src/views/shop/account.js';
import './src/routes/shop.js';
import './src/routes/account.js';
import './src/routes/admin.js';
import './src/routes/driver.js';
import './src/routes/links.js';

const PUBLIC = path.join(ROOT, 'public');
// Images produits : servies depuis config.uploadsDir (volume persistant en production).
const UPLOADS_PARENT = path.basename(config.uploadsDir) === 'uploads' ? path.dirname(config.uploadsDir) : null;

// Premier démarrage : base vide → données de démonstration.
if (one('SELECT COUNT(*) AS n FROM users').n === 0) {
  const { seed, DEMO_ACCOUNTS: A } = await import('./src/seed.js');
  seed();
  console.log(config.isProd ? `\n  Base initialisée. Administrateur : ${A.admin.email}` : '\n  Base de démonstration créée.');
}
(await import('./src/migrations.js')).runMigrations();
if (!config.isProd) {
  const { DEMO_ACCOUNTS: A } = await import('./src/seed.js');
  console.log('\n  Comptes de démonstration :');
  console.log(`   · Admin   ${A.admin.email} / ${A.admin.password}`);
  console.log(`   · Livreur ${A.driver.email} / ${A.driver.password}`);
  console.log(`   · Client  ${A.customer.email} / ${A.customer.password}`);
}

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  ...(config.isProd ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}),
};

/** Protection CSRF : toute requête qui modifie des données doit venir de notre propre origine. */
function sameOrigin(req) {
  let origin = req.headers.origin || null;
  if (!origin && req.headers.referer) { try { origin = new URL(req.headers.referer).origin; } catch { return false; } }
  if (!origin) return true; // clients non navigateurs (webhook Stripe, curl) — pas de cookie de session concerné
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http');
  return origin === `${proto}://${host}` || origin === config.baseUrl;
}

const server = http.createServer(async (req, res) => {
  for (const [k, val] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, val);
  const url = new URL(req.url, 'http://localhost');
  // HTTPS obligatoire : toute visite en http:// est renvoyée vers https:// (sauf en local).
  if (config.isProd && req.headers['x-forwarded-proto'] === 'http') {
    res.writeHead(301, { Location: `https://${req.headers['x-forwarded-host'] || req.headers.host}${req.url}` });
    return res.end();
  }
  const isApi = url.pathname.startsWith('/api/');
  const ctx = { req, res, url, query: url.searchParams, params: {}, body: {}, files: {}, rawBody: '', user: null, flash: null };
  try {
    if ((req.method === 'GET' || req.method === 'HEAD') && UPLOADS_PARENT && url.pathname.startsWith('/uploads/') && serveStatic(req, res, UPLOADS_PARENT)) return;
    if ((req.method === 'GET' || req.method === 'HEAD') && !isApi && url.pathname.includes('.') && serveStatic(req, res, PUBLIC)) return;
    const m = match(req.method, url.pathname);
    if (!m) throw new HttpError(404);
    if (m.methodNotAllowed) throw new HttpError(405, 'Méthode non autorisée');
    ctx.params = m.params;
    ctx.user = currentUser(req);
    if (req.method === 'POST') {
      if (!sameOrigin(req)) throw new HttpError(403, 'Requête refusée (origine inconnue).');
      const body = await readBody(req);
      ctx.body = body.fields; ctx.files = body.files; ctx.rawBody = body.raw;
    } else {
      ctx.flash = takeFlash(req, res);
    }
    await m.handler(ctx);
    if (req.method === 'GET' && !isApi && res.statusCode === 200) track(req, url, clientIp(req)); // statistiques anonymes
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) console.error(err);
    if (res.headersSent) return res.end();
    if (isApi || (req.headers.accept || '').includes('application/json')) return sendJson(res, { message: err.message || 'Erreur', errors: err.errors || {} }, status);
    if (status === 401) return redirect(res, `/connexion?suite=${encodeURIComponent(url.pathname)}`);
    sendHtml(res, errorPage(ctx, status, status === 500 ? '' : err.message), status);
  }
});

// Tâches de fond : commandes carte non payées, sessions expirées.
setInterval(() => {
  try { expireUnpaidOrders(45); run("DELETE FROM sessions WHERE expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')"); } catch (e) { console.error(e); }
}, 5 * 60e3).unref();

server.listen(config.port, () => {
  console.log(`\n  Maison Green est en ligne → ${config.baseUrl}`);
  console.log(`  Paiement carte : ${stripeEnabled() ? 'Stripe' : 'mode démo (ajoutez STRIPE_SECRET_KEY)'}\n`);
});
