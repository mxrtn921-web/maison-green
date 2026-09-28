// Temps réel : Server-Sent Events. Chaque client s'abonne à des « canaux ».
// Canaux : 'admin', 'drivers', 'driver:<id>', 'order:<tracking_token>'.
// (En déploiement multi-instances, remplacer par Redis pub/sub ou Supabase Realtime.)
const clients = new Set();

export function subscribe(req, res, channels) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 4000\n\n');
  const client = { res, channels: new Set(channels) };
  clients.add(client);
  const ping = setInterval(() => res.write(': ping\n\n'), 25e3);
  req.on('close', () => { clearInterval(ping); clients.delete(client); });
}

export function publish(channel, event, data = {}) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) if (c.channels.has(channel)) c.res.write(payload);
}
