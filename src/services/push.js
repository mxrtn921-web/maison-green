// Notifications push Web Push (VAPID), sans dépendance : alertes même téléphone verrouillé.
// Le contenu de l'alerte (titre, texte, lien, course) est chiffré dans le message (RFC 8291, aes128gcm) :
// le téléphone l'affiche sans avoir besoin d'appeler le site (indispensable sur iPhone, app fermée).
// Ancien abonnement sans clés : message vide, le service worker récupère alors /api/notifications.
import crypto from 'node:crypto';
import { one, all, run, getSetting, setSetting, nowIso } from '../db.js';
import { config } from '../config.js';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

/** Clés VAPID : créées au premier usage et conservées dans la base (volume persistant). */
function vapid() {
  let jwk = getSetting('vapid_private_jwk', null);
  if (!jwk) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    jwk = privateKey.export({ format: 'jwk' });
    setSetting('vapid_private_jwk', jwk);
  }
  const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  const publicKey = b64u(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]));
  return { key, publicKey };
}
export const publicKey = () => vapid().publicKey;

function vapidHeader(endpoint) {
  const { key, publicKey: k } = vapid();
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:bonjour@maisongreen.fr' }));
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${k}`;
}

/** Adresse d'abonnement valide : HTTPS (HTTP accepté en local pour les tests). */
export function validEndpoint(endpoint) {
  try {
    const u = new URL(String(endpoint));
    return (u.protocol === 'https:' || (!config.isProd && u.protocol === 'http:')) && String(endpoint).length < 1000;
  } catch { return false; }
}

const validKeys = (keys) => {
  try {
    const p = Buffer.from(String(keys?.p256dh || ''), 'base64url'); const a = Buffer.from(String(keys?.auth || ''), 'base64url');
    return p.length === 65 && p[0] === 4 && a.length === 16;
  } catch { return false; }
};

export function subscribe(userId, endpoint, userAgent = '', keys = null) {
  if (!validEndpoint(endpoint)) return false;
  const k = validKeys(keys) ? { p256dh: String(keys.p256dh), auth: String(keys.auth) } : { p256dh: '', auth: '' };
  run(`INSERT INTO push_subscriptions (user_id, endpoint, user_agent, p256dh, auth) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, user_agent = excluded.user_agent,
         p256dh = CASE WHEN excluded.p256dh <> '' THEN excluded.p256dh ELSE push_subscriptions.p256dh END,
         auth = CASE WHEN excluded.auth <> '' THEN excluded.auth ELSE push_subscriptions.auth END`,
    userId, String(endpoint), String(userAgent).slice(0, 200), k.p256dh, k.auth);
  return true;
}

/** Chiffre le message pour un abonnement (RFC 8291 + RFC 8188, un seul bloc aes128gcm). */
export function encryptPayload(payload, p256dh, auth) {
  const uaPublic = Buffer.from(p256dh, 'base64url');
  const authSecret = Buffer.from(auth, 'base64url');
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const hkdf = (ikm, salt, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));
  const ikm = hkdf(shared, authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  const salt = crypto.randomBytes(16);
  const cek = hkdf(ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}
export const unsubscribe = (userId, endpoint) => run('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', userId, String(endpoint));
export const subscriptionCount = (userId) => one('SELECT COUNT(*) AS n FROM push_subscriptions WHERE user_id = ?', userId).n;

async function send(sub, message = null) {
  try {
    const headers = { TTL: '3600', Urgency: 'high', Authorization: vapidHeader(sub.endpoint) };
    let body = '';
    if (message && sub.p256dh && sub.auth) {
      try {
        body = encryptPayload(JSON.stringify(message), sub.p256dh, sub.auth);
        headers['Content-Encoding'] = 'aes128gcm';
        headers['Content-Type'] = 'application/octet-stream';
      } catch (e) { body = ''; console.error('Chiffrement push impossible :', e.message); }
    }
    const r = await fetch(sub.endpoint, { method: 'POST', body, headers, signal: AbortSignal.timeout(10000) });
    if (r.status === 404 || r.status === 410) run('DELETE FROM push_subscriptions WHERE id = ?', sub.id); // abonnement expiré
    else if (r.ok) run('UPDATE push_subscriptions SET last_ok_at = ? WHERE id = ?', nowIso(), sub.id);
    else console.error(`Push refusé (${r.status}) pour l'abonnement ${sub.id}`);
  } catch (e) { console.error('Push impossible :', e.message); }
}

/** Envoie une alerte à un utilisateur, ou à un public : 'admin' ou 'driver' (livreurs disponibles uniquement). */
export function pushTo({ userId = null, audience = null, message = null }) {
  let subs = [];
  if (userId) subs = all('SELECT s.* FROM push_subscriptions s JOIN users u ON u.id = s.user_id WHERE s.user_id = ? AND u.is_active = 1', userId);
  else if (audience === 'admin') subs = all("SELECT s.* FROM push_subscriptions s JOIN users u ON u.id = s.user_id WHERE u.role = 'admin' AND u.is_active = 1");
  else if (audience === 'driver') {
    subs = all(`SELECT s.* FROM push_subscriptions s JOIN users u ON u.id = s.user_id JOIN drivers d ON d.user_id = u.id
                WHERE u.role = 'driver' AND u.is_active = 1 AND d.is_available = 1`);
  }
  return Promise.all(subs.map((s) => send(s, message)));
}
