// Gabarits HTML sûrs : toute valeur interpolée est échappée, sauf si elle est marquée raw().
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s ?? ''));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function render(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Raw(out);
}

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
export const money = (cents) => eur.format((cents || 0) / 100).replace(/ /g, ' ');
export const centsToInput = (cents) => ((cents || 0) / 100).toFixed(2).replace('.', ',');

export const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
export const attrs = (obj) => raw(Object.entries(obj).filter(([, v]) => v !== false && v != null)
  .map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`)).join(' '));
