// Mesure d'audience anonyme, conforme aux recommandations de la CNIL (exemptée de consentement) :
// pas de cookie, pas d'adresse IP ni d'identifiant conservés, uniquement des totaux par jour.
// Visiteurs uniques : empreinte (IP + navigateur) hachée avec un sel aléatoire qui change chaque jour
// et n'existe qu'en mémoire : impossible de relier deux jours ou de retrouver une personne.
import crypto from 'node:crypto';
import { all, run, tx } from '../db.js';
import { parisNow, addDays } from '../lib/time.js';

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|node-fetch|headless|lighthouse|monitor|uptime/i;
// Pages publiques uniquement (pas l'admin, l'espace livreur, le compte client, le suivi ni le paiement).
const PRIVATE = /^\/(admin|livreur|compte|suivi|paiement|api|connexion|inscription|deconnexion|commande\/retour)/;

let today = null; let salt = null; let seen = new Set();

function inc(day, dim, key, by = 1) {
  run(`INSERT INTO analytics_daily (day, dim, key, n) VALUES (?, ?, ?, ?)
       ON CONFLICT(day, dim, key) DO UPDATE SET n = n + excluded.n`, day, dim, String(key).slice(0, 120), by);
}

const deviceOf = (ua) => (/iPad|Tablet/i.test(ua) ? 'Tablette' : /Mobi|Android|iPhone/i.test(ua) ? 'Mobile' : 'Ordinateur');
function sourceOf(url, referer, ownHost) {
  const utm = url.searchParams.get('utm_source');
  if (utm) return utm.toLowerCase().slice(0, 40);
  if (!referer) return 'Accès direct';
  try {
    const h = new URL(referer).hostname.replace(/^www\./, '');
    if (!h || h === ownHost) return null; // navigation interne : pas une nouvelle source
    if (/google\./.test(h)) return 'Google';
    if (/facebook\.|fb\./.test(h)) return 'Facebook';
    if (/instagram\./.test(h)) return 'Instagram';
    if (/tiktok\./.test(h)) return 'TikTok';
    if (/bing\./.test(h)) return 'Bing';
    return h;
  } catch { return 'Accès direct'; }
}

/** À appeler pour chaque page HTML affichée avec succès. Ne lève jamais d'erreur. */
export function track(req, url, ip) {
  try {
    if (req.method !== 'GET' || PRIVATE.test(url.pathname) || url.pathname.includes('.')) return;
    const ua = String(req.headers['user-agent'] || '');
    if (!ua || BOT.test(ua) || req.headers['purpose'] === 'prefetch' || req.headers['sec-purpose']) return;
    if (!String(req.headers.accept || '').includes('text/html')) return;
    const day = parisNow().date;
    if (day !== today) { today = day; salt = crypto.randomBytes(16); seen = new Set(); }
    const page = url.pathname === '/boutique' && url.searchParams.get('categorie') ? `/boutique?categorie=${url.searchParams.get('categorie')}` : url.pathname;
    const fp = crypto.createHmac('sha256', salt).update(`${ip}|${ua}`).digest('base64url').slice(0, 22);
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').replace(/^www\./, '').split(':')[0];
    tx(() => {
      inc(day, 'total', 'views'); inc(day, 'page', page);
      if (!seen.has(fp)) {
        seen.add(fp);
        inc(day, 'total', 'visitors'); inc(day, 'device', deviceOf(ua));
        inc(day, 'source', sourceOf(url, req.headers.referer, host) || 'Accès direct');
      }
    });
  } catch (e) { console.error('Statistiques :', e.message); }
}

/** Tableau de bord des statistiques sur `days` jours (heure de Paris). */
export function report(days = 30) {
  const end = parisNow().date; const start = addDays(end, -(days - 1));
  const rows = all('SELECT day, dim, key, SUM(n) AS n FROM analytics_daily WHERE day BETWEEN ? AND ? GROUP BY day, dim, key', start, end);
  const series = []; for (let i = 0; i < days; i++) series.push({ day: addDays(start, i), visitors: 0, views: 0, orders: 0 });
  const byDay = Object.fromEntries(series.map((d) => [d.day, d]));
  const top = { page: {}, source: {}, device: {} };
  for (const r of rows) {
    if (r.dim === 'total' && byDay[r.day]) byDay[r.day][r.key] = r.n;
    else if (top[r.dim]) top[r.dim][r.key] = (top[r.dim][r.key] || 0) + r.n;
  }
  // Commandes payées (hors annulations) sur la même période, pour le taux de conversion.
  const since = new Date(Date.now() - (days + 1) * 864e5).toISOString();
  for (const o of all("SELECT created_at FROM orders WHERE created_at >= ? AND status NOT IN ('awaiting_payment', 'cancelled')", since)) {
    const d = byDay[parisNow(new Date(o.created_at)).date]; if (d) d.orders++;
  }
  const sum = (k) => series.reduce((s, d) => s + d[k], 0);
  const sorted = (o, n = 8) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, n]) => ({ key, n }));
  const visitors = sum('visitors');
  // Conversion calculée uniquement sur les jours mesurés (évite un taux absurde avec d'anciennes commandes).
  const measuredOrders = series.filter((d) => d.visitors > 0).reduce((s, d) => s + d.orders, 0);
  // Pages produit : on affiche le nom du produit plutôt que son adresse.
  const names = Object.fromEntries(all('SELECT slug, name FROM products').map((p) => [`/produit/${p.slug}`, p.name]));
  const pages = sorted(top.page).map((p) => ({ ...p, name: names[p.key] || null }));
  return { start, end, series, visitors, views: sum('views'), orders: sum('orders'),
    conversion: visitors ? Math.min(100, (measuredOrders / visitors) * 100) : 0,
    pages, sources: sorted(top.source), devices: sorted(top.device, 3) };
}

export const clearAnalytics = () => run('DELETE FROM analytics_daily');
