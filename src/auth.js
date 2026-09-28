// Authentification : mots de passe (scrypt), sessions serveur révocables, rôles, limitation des tentatives.
import crypto from 'node:crypto';
import { one, run, nowIso } from './db.js';
import { parseCookies, setCookie, HttpError } from './lib/http.js';

const SESSION_COOKIE = 'mg_session';
const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [algo, N, r, p, saltB64, hashB64] = String(stored).split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(expected, actual);
}

// Hash factice : on vérifie toujours un mot de passe, même si l'e-mail n'existe pas (pas d'énumération par le temps de réponse).
const DUMMY_HASH = hashPassword(crypto.randomBytes(12).toString('hex'));
export function authenticate(email, password) {
  const user = one('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', String(email).trim().toLowerCase());
  const ok = verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok || !user.is_active) return null;
  return user;
}

const tokenId = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400e3).toISOString();
  run('INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)',
    tokenId(token), userId, expires, String(req.headers['user-agent'] || '').slice(0, 200));
  setCookie(res, SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400 });
}

export function endSession(req, res) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (token) run('DELETE FROM sessions WHERE id = ?', tokenId(token));
  setCookie(res, SESSION_COOKIE, '', { maxAge: 0 });
}

export function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token || token.length > 100) return null;
  const row = one(`SELECT u.id, u.email, u.role, u.first_name, u.last_name, u.phone, u.stripe_customer_id, u.is_active, s.expires_at
                   FROM sessions s JOIN users u ON u.id = s.user_id
                   WHERE s.id = ? AND u.deleted_at IS NULL`, tokenId(token));
  if (!row || row.expires_at < nowIso() || !row.is_active) return null;
  return row;
}

export function revokeAllSessions(userId) { run('DELETE FROM sessions WHERE user_id = ?', userId); }

/** Contrôle d'accès par rôle. Lève 401 (non connecté) ou 403 (mauvais rôle). */
export function requireRole(ctx, ...roles) {
  if (!ctx.user) throw new HttpError(401, 'Connexion requise');
  if (roles.length && !roles.includes(ctx.user.role)) throw new HttpError(403, 'Accès refusé');
  return ctx.user;
}

// Limitation simple des tentatives (anti-force brute), en mémoire.
const buckets = new Map();
export function rateLimit(key, max = 8, windowMs = 15 * 60e3) {
  const now = Date.now();
  const b = buckets.get(key) || { count: 0, reset: now + windowMs };
  if (now > b.reset) { b.count = 0; b.reset = now + windowMs; }
  b.count++;
  buckets.set(key, b);
  if (b.count > max) throw new HttpError(429, 'Trop de tentatives. Réessayez dans quelques minutes.');
}
/** Connexion réussie : on repart de zéro pour ce compte (seuls les échecs doivent bloquer). */
export const resetRateLimit = (key) => buckets.delete(key);
setInterval(() => { const n = Date.now(); for (const [k, b] of buckets) if (n > b.reset) buckets.delete(k); }, 60e3).unref();
