// Configuration : lit le fichier .env (sans dépendance) puis les variables d'environnement.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadDotEnv();

const env = process.env;
const isProd = env.NODE_ENV === 'production';

// Secret de session : obligatoire en production, généré et mémorisé en local.
function sessionSecret() {
  if (env.SESSION_SECRET && env.SESSION_SECRET.length >= 32) return env.SESSION_SECRET;
  if (isProd) throw new Error('SESSION_SECRET (32 caractères minimum) est obligatoire en production.');
  const file = path.join(ROOT, 'data', '.dev-secret');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(48).toString('hex'));
  return fs.readFileSync(file, 'utf8').trim();
}

export const config = {
  isProd,
  port: Number(env.PORT || 3000),
  baseUrl: (env.BASE_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  dbFile: env.DATABASE_FILE || path.join(ROOT, 'data', 'maison-green.db'),
  sessionSecret: sessionSecret(),
  stripe: {
    secretKey: env.STRIPE_SECRET_KEY || '',
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
  },
  email: {
    resendKey: env.RESEND_API_KEY || '',
    from: env.EMAIL_FROM || 'Maison Green <commandes@maisongreen.fr>',
  },
  // En production, UPLOADS_DIR pointe vers le volume persistant (ex. /app/data/uploads).
  uploadsDir: env.UPLOADS_DIR || path.join(ROOT, 'public', 'uploads'),
};

export const stripeEnabled = () => Boolean(config.stripe.secretKey);
