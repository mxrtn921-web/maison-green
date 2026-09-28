// Service worker Maison Green : affiche les alertes push (commandes, courses) même téléphone verrouillé.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let n = { title: 'Maison Green', body: 'Nouvelle notification', link: '/' };
    try {
      const r = await fetch('/api/notifications', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (r.ok) { const list = await r.json(); if (list.length) n = list[0]; }
    } catch { /* hors ligne : message générique */ }
    await self.registration.showNotification(n.title, {
      body: n.body || '', icon: '/img/favicon.svg', badge: '/img/favicon.svg', tag: `mg-${n.id || Date.now()}`,
      renotify: true, requireInteraction: true, vibrate: [200, 100, 200, 100, 200], data: { link: n.link || '/' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.link || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) { if (new URL(w.url).origin === self.location.origin) { await w.focus(); return w.navigate(url); } }
    return self.clients.openWindow(url);
  })());
});
