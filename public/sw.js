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

async function openUrl(link) {
  const url = new URL(link || '/', self.location.origin).href;
  const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const w of wins) { if (new URL(w.url).origin === self.location.origin) { await w.focus(); return w.navigate(url); } }
  return self.clients.openWindow(url);
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
