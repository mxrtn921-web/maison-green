// Service worker Maison Green : affiche les alertes push (commandes, courses) même téléphone verrouillé.
// Nouvelle course : boutons « Accepter / Refuser » directement dans la notification (Android, ordinateur).
// Sur iPhone (les boutons n'existent pas), toucher l'alerte ouvre la course avec les deux boutons.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

const show = (title, opts) => self.registration.showNotification(title, {
  icon: '/img/favicon.svg', badge: '/img/favicon.svg', vibrate: [200, 100, 200, 100, 200], ...opts,
});

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let n = { title: 'Maison Green', body: 'Nouvelle notification', link: '/' };
    try {
      const r = await fetch('/api/notifications', { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (r.ok) { const list = await r.json(); if (list.length) n = list[0]; }
    } catch { /* hors ligne : message générique */ }
    const isRun = n.kind === 'delivery_available' && n.order_id;
    await show(n.title, {
      body: n.body || '', tag: `mg-${n.id || Date.now()}`, renotify: true, requireInteraction: true,
      data: { link: n.link || '/', orderId: n.order_id || null, kind: n.kind || null },
      actions: isRun ? [{ action: 'accept', title: '✅ Accepter' }, { action: 'refuse', title: '❌ Refuser' }] : [],
    });
  })());
});

// Ouvre la bonne page au toucher de l'alerte.
// iPhone : `navigate()` sur l'app déjà ouverte donne souvent un écran blanc, et une app fermée peut se rouvrir
// sur la page d'accueil au lieu de la course. Donc : 1) on mémorise la page à ouvrir (la page la réclame dès
// qu'elle s'affiche), 2) on prévient la page déjà ouverte par message, 3) sinon on ouvre une fenêtre.
const NAV_CACHE = 'mg-nav';
const NAV_KEY = '/__mg/pending-nav';
async function rememberNav(url) {
  try { const c = await caches.open(NAV_CACHE); await c.put(NAV_KEY, new Response(JSON.stringify({ url, at: Date.now() }), { headers: { 'Content-Type': 'application/json' } })); } catch { /* stockage indisponible */ }
}
async function takeNav() {
  try {
    const c = await caches.open(NAV_CACHE); const r = await c.match(NAV_KEY);
    if (!r) return null;
    await c.delete(NAV_KEY);
    const v = await r.json();
    return Date.now() - v.at < 3 * 60e3 ? v.url : null;
  } catch { return null; }
}
self.addEventListener('fetch', (event) => {
  if (new URL(event.request.url).pathname !== NAV_KEY) return; // tout le reste passe normalement
  event.respondWith(takeNav().then((url) => new Response(JSON.stringify({ url }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })));
});

const IOS = /iPhone|iPad|iPod/.test(self.navigator.userAgent) || (/Macintosh/.test(self.navigator.userAgent) && self.navigator.maxTouchPoints > 1);
const absUrl = (link) => new URL(link || '/livreur', self.location.origin).href;

async function tellOpenPage(url) {
  const wins = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
    .filter((w) => new URL(w.url).origin === self.location.origin);
  const w = wins.find((c) => c.focused) || wins.find((c) => c.visibilityState === 'visible') || wins[0];
  if (!w) return false;
  try { await w.focus(); } catch { /* déjà au premier plan */ }
  w.postMessage({ type: 'navigate', url });
  return true;
}

// À appeler SANS attente préalable : l'iPhone n'autorise l'ouverture que tout de suite après le toucher.
function openUrl(link) {
  const url = absUrl(link);
  if (IOS) {
    // iPhone : openWindow ouvre l'app sur la course (qu'elle soit fermée, en veille ou ouverte).
    const opening = self.clients.openWindow(url).catch(() => null);
    return Promise.all([rememberNav(url), opening.then((w) => (w ? w : tellOpenPage(url)))]);
  }
  // Android / ordinateur : on réutilise la fenêtre ouverte, sinon on en ouvre une.
  return rememberNav(url).then(() => tellOpenPage(url)).then((ok) => (ok ? null : self.clients.openWindow(url).catch(() => null)));
}

self.addEventListener('notificationclick', (event) => {
  const { data = {} } = event.notification;
  event.notification.close();
  const action = event.action;
  if ((action === 'accept' || action === 'refuse') && data.orderId) {
    event.waitUntil((async () => {
      try {
        const r = await fetch(`/api/livreur/courses/${data.orderId}/${action}`, {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: '{}',
        });
        const res = await r.json().catch(() => ({}));
        await show(res.ok ? (action === 'accept' ? 'Course acceptée ✓' : 'Course refusée') : 'Action impossible',
          { body: res.message || '', tag: `mg-res-${data.orderId}`, data: { link: action === 'accept' && res.ok ? `/livreur/courses/${data.orderId}` : '/livreur' } });
      } catch {
        await openUrl(data.link);
      }
    })());
    return;
  }
  event.waitUntil(openUrl(data.link));
});
