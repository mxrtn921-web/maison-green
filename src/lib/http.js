// Outils HTTP : lecture du corps (formulaire, JSON, multipart), cookies, réponses, fichiers statiques.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; Object.assign(this, extra); }
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* cookie invalide ignoré */ }
  }
  return out;
}

export function setCookie(res, name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${opts.path || '/'}`, 'SameSite=Lax'];
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (config.isProd) parts.push('Secure');
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  const prev = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : [prev]), parts.join('; ')]);
}

export function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Fichier trop volumineux (5 Mo maximum).')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Parse un formulaire urlencoded en objet ; les clés « x[] » deviennent des tableaux. */
export function parseForm(str) {
  const out = {};
  for (const [k, v] of new URLSearchParams(str)) {
    if (k.endsWith('[]')) (out[k.slice(0, -2)] ||= []).push(v);
    else out[k] = v;
  }
  return out;
}

function parseMultipart(buf, boundary) {
  const fields = {}; const files = {};
  const delim = Buffer.from(`--${boundary}`);
  let pos = buf.indexOf(delim);
  while (pos !== -1) {
    const next = buf.indexOf(delim, pos + delim.length);
    if (next === -1) break;
    const part = buf.subarray(pos + delim.length + 2, next - 2); // retire \r\n
    const headEnd = part.indexOf('\r\n\r\n');
    if (headEnd > 0) {
      const head = part.subarray(0, headEnd).toString('utf8');
      const data = part.subarray(headEnd + 4);
      const name = /name="([^"]+)"/.exec(head)?.[1];
      const filename = /filename="([^"]*)"/.exec(head)?.[1];
      if (name) {
        if (filename !== undefined) { if (data.length) files[name] = { filename, data }; }
        else if (name.endsWith('[]')) (fields[name.slice(0, -2)] ||= []).push(data.toString('utf8'));
        else fields[name] = data.toString('utf8');
      }
    }
    pos = next;
  }
  return { fields, files };
}

export async function readBody(req) {
  const type = req.headers['content-type'] || '';
  if (type.startsWith('multipart/form-data')) {
    const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(type);
    const buf = await readRaw(req, 6 * 1024 * 1024);
    return { ...parseMultipart(buf, boundary[1] || boundary[2]), raw: null };
  }
  const buf = await readRaw(req, 256 * 1024);
  const raw = buf.toString('utf8');
  if (type.includes('application/json')) {
    try { return { fields: raw ? JSON.parse(raw) : {}, files: {}, raw }; } catch { throw new HttpError(400, 'JSON invalide'); }
  }
  return { fields: parseForm(raw), files: {}, raw };
}

export function send(res, status, body, type = 'text/html; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, ...headers });
  res.end(body);
}
export const sendHtml = (res, body, status = 200) => send(res, status, String(body));
export const sendJson = (res, data, status = 200) => send(res, status, JSON.stringify(data), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store' });
export function redirect(res, location, status = 303) { res.writeHead(status, { Location: location }); res.end(); }

// Messages « flash » signés (affichés une fois après une redirection)
const sign = (v) => crypto.createHmac('sha256', config.sessionSecret).update(v).digest('base64url');
export function setFlash(res, type, message) {
  const v = Buffer.from(JSON.stringify({ type, message })).toString('base64url');
  setCookie(res, 'mg_flash', `${v}.${sign(v)}`, { maxAge: 60 });
}
export function takeFlash(req, res) {
  const c = parseCookies(req.headers.cookie).mg_flash;
  if (!c) return null;
  setCookie(res, 'mg_flash', '', { maxAge: 0 });
  const [v, s] = c.split('.');
  if (!v || !s || sign(v) !== s) return null;
  try { return JSON.parse(Buffer.from(v, 'base64url').toString('utf8')); } catch { return null; }
}

// Fichiers statiques
const MIME = {
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};
export function serveStatic(req, res, publicDir) {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(publicDir, url));
  if (!file.startsWith(publicDir + path.sep)) return false;
  let stat;
  try { stat = fs.statSync(file); } catch { return false; }
  if (!stat.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  const immutable = url.startsWith('/fonts/') || url.startsWith('/uploads/');
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end(), true;
  fs.createReadStream(file).pipe(res);
  return true;
}
