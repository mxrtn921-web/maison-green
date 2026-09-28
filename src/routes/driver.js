// Application livreur : uniquement les informations nécessaires à la livraison.
import { get, post } from '../router.js';
import { sendHtml, sendJson, redirect, setFlash, HttpError } from '../lib/http.js';
import { subscribe } from '../lib/events.js';
import { one, all, run } from '../db.js';
import { requireRole } from '../auth.js';
import { parisNow, parisToUtc } from '../lib/time.js';
import { getOrder, orderItems, driverAction } from '../services/orders.js';
import { driverHomePage, driverRunPage } from '../views/driver/pages.js';

const driverOf = (ctx) => { requireRole(ctx, 'driver'); return one('SELECT * FROM drivers WHERE user_id = ?', ctx.user.id) || { vehicle: '', is_available: 1 }; };
const SELECT = `SELECT id, number, status, address_line1, postal_code, city, slot_date, slot_start, slot_end, total_cents, payment_method, payment_status,
                cash_to_collect_cents, delivered_at, driver_id FROM orders`;

get('/livreur', (ctx) => {
  const driver = driverOf(ctx);
  const me = ctx.user.id;
  const today = parisToUtc(parisNow().date, '00:00').toISOString();
  const available = all(`${SELECT} WHERE driver_id IS NULL AND status IN ('confirmed','preparing','ready') ORDER BY slot_date, slot_start, id`);
  const mine = all(`${SELECT} WHERE driver_id = ? AND status IN ('confirmed','preparing','ready','assigned','out_for_delivery')
                    ORDER BY CASE status WHEN 'out_for_delivery' THEN 0 WHEN 'assigned' THEN 1 WHEN 'ready' THEN 2 ELSE 3 END, slot_date, slot_start`, me);
  const done = all(`${SELECT} WHERE driver_id = ? AND status = 'delivered' AND delivered_at >= ? ORDER BY delivered_at DESC`, me, today);
  const cashHeld = one('SELECT COALESCE(SUM(cash_to_collect_cents),0) AS n FROM orders WHERE driver_id = ? AND cash_collected_at IS NOT NULL AND cash_remitted_at IS NULL', me).n;
  let tab = ctx.query.get('onglet');
  if (!['disponibles', 'mes-courses', 'terminees'].includes(tab)) tab = mine.length ? 'mes-courses' : 'disponibles';
  sendHtml(ctx.res, driverHomePage(ctx, { driver, tab, available, mine, done, counts: { disponibles: available.length, 'mes-courses': mine.length, cashHeld } }));
});

get('/livreur/courses/:id', (ctx) => {
  const driver = driverOf(ctx);
  const o = getOrder(Number(ctx.params.id));
  // Un livreur ne voit que ses courses, ou celles qui attendent un livreur.
  if (!o || (o.driver_id && o.driver_id !== ctx.user.id) || (!o.driver_id && !['confirmed', 'preparing', 'ready'].includes(o.status))) throw new HttpError(404, 'Course introuvable');
  sendHtml(ctx.res, driverRunPage(ctx, { driver, order: o, items: orderItems(o.id) }));
});

const MESSAGES = { accept: 'Course acceptée : allez la récupérer puis livrez-la.', refuse: 'Course refusée : la commande est annulée et le client remboursé.', pickup: 'Commande récupérée. Bonne route !', start: 'Livraison démarrée : le client est prévenu.', deliver: 'Livraison terminée. Merci !' };
post('/livreur/courses/:id/:action', async (ctx) => {
  const driver = driverOf(ctx);
  const { id, action } = ctx.params;
  if (!MESSAGES[action]) throw new HttpError(404);
  if (action === 'accept' && !driver.is_available) { setFlash(ctx.res, 'error', 'Passez-vous « Disponible » pour accepter une course.'); return redirect(ctx.res, '/livreur'); }
  try {
    await driverAction(Number(id), ctx.user, action);
    setFlash(ctx.res, 'success', MESSAGES[action]);
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    setFlash(ctx.res, 'error', e.message);
  }
  redirect(ctx.res, action === 'deliver' ? '/livreur?onglet=terminees' : action === 'refuse' ? '/livreur?onglet=disponibles' : `/livreur/courses/${id}`);
});

// Boutons « Accepter / Refuser » directement dans la notification (service worker).
post('/api/livreur/courses/:id/:action', async (ctx) => {
  const driver = driverOf(ctx);
  const { id, action } = ctx.params;
  if (!['accept', 'refuse'].includes(action)) throw new HttpError(404);
  if (action === 'accept' && !driver.is_available) return sendJson(ctx.res, { ok: false, message: 'Passez-vous « Disponible » pour accepter une course.' }, 409);
  try {
    const o = await driverAction(Number(id), ctx.user, action);
    sendJson(ctx.res, { ok: true, number: o.number, message: MESSAGES[action] });
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    sendJson(ctx.res, { ok: false, message: e.message }, 409);
  }
});

post('/livreur/disponibilite', (ctx) => {
  driverOf(ctx);
  run('UPDATE drivers SET is_available = ? WHERE user_id = ?', ctx.body.available ? 1 : 0, ctx.user.id);
  redirect(ctx.res, ctx.req.headers.referer ? new URL(ctx.req.headers.referer).pathname + new URL(ctx.req.headers.referer).search : '/livreur');
});

get('/api/livreur/events', (ctx) => { requireRole(ctx, 'driver'); subscribe(ctx.req, ctx.res, ['driver', `user:${ctx.user.id}`]); });
