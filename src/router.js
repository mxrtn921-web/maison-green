// Mini-routeur : chemins avec paramètres (« /admin/commandes/:id »).
const routes = [];

export function route(method, path, handler) {
  const keys = [];
  const re = new RegExp(`^${path.replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; })}/?$`);
  routes.push({ method, re, keys, handler });
}
export const get = (p, h) => route('GET', p, h);
export const post = (p, h) => route('POST', p, h);

export function match(method, pathname) {
  let pathMatched = false;
  for (const r of routes) {
    const m = r.re.exec(pathname);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
    const params = {};
    r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    return { handler: r.handler, params };
  }
  return pathMatched ? { methodNotAllowed: true } : null;
}
