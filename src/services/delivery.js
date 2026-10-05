// Zones de livraison, horaires d'ouverture, créneaux et disponibilité.
import { all, one, getSetting } from '../db.js';
import { parisNow, addDays, weekdayOf, toMinutes, dayLabel, hLabel, WEEKDAYS } from '../lib/time.js';

export const zones = (activeOnly = true) =>
  all(`SELECT * FROM delivery_zones ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY position, fee_cents`);

export function zoneForPostal(postal) {
  const code = String(postal || '').trim();
  if (!/^\d{5}$/.test(code)) return null;
  return zones().find((z) => z.postal_codes.split(/[\s,;]+/).includes(code)) || null;
}

/** Frais de livraison pour un sous-total donné (livraison offerte au-delà d'un seuil éventuel). */
export function deliveryFee(zone, subtotal) {
  if (!zone) return 0;
  if (zone.free_over_cents && subtotal >= zone.free_over_cents) return 0;
  return zone.fee_cents;
}

export const openingHours = () => all('SELECT * FROM opening_hours ORDER BY weekday');

/** La boutique est-elle ouverte en ce moment ? */
export function shopOpenNow(now = parisNow()) {
  const h = one('SELECT * FROM opening_hours WHERE weekday = ?', now.weekday);
  const closed = one('SELECT 1 AS x FROM closures WHERE date = ?', now.date);
  // Fin de soirée de la veille quand celle-ci ferme après minuit (ex. 10:00 → 02:00).
  const prev = one('SELECT * FROM opening_hours WHERE weekday = ?', (now.weekday + 6) % 7);
  const prevClosed = one('SELECT 1 AS x FROM closures WHERE date = ?', addDays(now.date, -1));
  if (prev?.is_open && !prevClosed && toMinutes(prev.closes_at) <= toMinutes(prev.opens_at) && now.minutes < toMinutes(prev.closes_at)) return true;
  if (!h || !h.is_open || closed) return false;
  const o = toMinutes(h.opens_at), c = toMinutes(h.closes_at);
  return c > o ? now.minutes >= o && now.minutes < c : now.minutes >= o;
}

const ACTIVE_STATUSES = `status NOT IN ('cancelled')`;

/** Fin d'un créneau en minutes depuis le début de son jour (un créneau qui finit après minuit dépasse 1440). */
const slotEndMinutes = (s) => { const a = toMinutes(s.starts_at), b = toMinutes(s.ends_at); return b > a ? b : b + 1440; };

/**
 * Créneaux disponibles sur les N prochains jours.
 * Un créneau reste réservable tant qu'il reste au moins le délai de préparation avant sa fin :
 * à 23h, le créneau 23h – 2h est proposé tout de suite (livraison dans l'heure).
 * Après minuit, le créneau de la veille qui court encore (ex. 23h – 2h) est proposé dans « Aujourd'hui ».
 */
export function availableSlots(days = 7, now = parisNow()) {
  const lead = Number(getSetting('lead_time_minutes', 45));
  const closures = new Set(all('SELECT date FROM closures').map((c) => c.date));
  const hours = Object.fromEntries(openingHours().map((h) => [h.weekday, h]));
  const counts = new Map(all(`SELECT slot_date || ' ' || slot_start AS k, COUNT(*) AS n FROM orders
                              WHERE slot_date >= ? AND ${ACTIVE_STATUSES} GROUP BY k`, addDays(now.date, -1)).map((r) => [r.k, r.n]));
  const make = (date, s) => {
    const used = counts.get(`${date} ${s.starts_at}`) || 0;
    return { date, start: s.starts_at, end: s.ends_at, remaining: Math.max(0, s.capacity - used), label: `${hLabel(s.starts_at)} – ${hLabel(s.ends_at)}` };
  };
  const slotsOf = (wd) => all('SELECT * FROM delivery_slots WHERE weekday = ? AND is_active = 1 ORDER BY starts_at', wd);
  const out = [];
  // Créneaux de la veille qui débordent après minuit et ne sont pas encore terminés.
  const yesterday = addDays(now.date, -1);
  const ywd = weekdayOf(yesterday);
  const carry = (closures.has(yesterday) || !hours[ywd]?.is_open) ? []
    : slotsOf(ywd).filter((s) => slotEndMinutes(s) > 1440 && now.minutes + lead <= slotEndMinutes(s) - 1440).map((s) => make(yesterday, s));
  for (let i = 0; i < days; i++) {
    const date = addDays(now.date, i);
    const wd = weekdayOf(date);
    const open = !closures.has(date) && hours[wd]?.is_open;
    const slots = [...(i === 0 ? carry : []), ...(open ? slotsOf(wd)
      .filter((s) => i > 0 || now.minutes + lead <= slotEndMinutes(s))
      .map((s) => make(date, s)) : [])];
    if (slots.length) out.push({ date, label: dayLabel(date, now.date), slots });
  }
  return out;
}

export function findSlot(date, start) {
  for (const d of availableSlots(8)) {
    const s = d.slots.find((x) => x.date === date && x.start === start);
    if (s) return s.remaining > 0 ? s : null;
  }
  return null;
}

/** État global de la prise de commande, pour afficher un message clair au client. */
/** Livreurs actifs et en mode « Disponible » : sans eux, aucune commande n'est possible. */
export const availableDrivers = () => one(`SELECT COUNT(*) AS n FROM users u JOIN drivers d ON d.user_id = u.id
                                          WHERE u.role = 'driver' AND u.is_active = 1 AND d.is_available = 1`).n;
export const NO_DRIVER_MESSAGE = "Aucun livreur n'est disponible pour le moment : les commandes reprendront dès qu'un livreur sera en service.";

export function orderingState() {
  const paused = getSetting('orders_paused', false);
  const days = availableSlots();
  const first = days.flatMap((d) => d.slots.filter((s) => s.remaining > 0).map((s) => ({ ...s, dayLabel: d.label, dayDate: d.date })))[0] || null;
  const now = parisNow();
  const open = shopOpenNow(now);
  const drivers = availableDrivers();
  let message = null;
  if (paused) message = getSetting('pause_message', 'Les commandes sont momentanément suspendues. Revenez très vite.');
  else if (!drivers) message = NO_DRIVER_MESSAGE;
  else if (!first) message = "Aucun créneau de livraison n'est disponible pour le moment.";
  else if (first.dayDate !== now.date) message = `Livraisons terminées pour aujourd'hui. Prochain créneau : ${first.dayLabel.toLowerCase()}, ${first.label}.`;
  return { accepting: !paused && drivers > 0 && Boolean(first), open, nextSlot: first, message, isToday: first?.dayDate === now.date };
}

export function hoursSummary() {
  const h = openingHours();
  return h.map((x) => ({ day: WEEKDAYS[x.weekday], weekday: x.weekday, open: Boolean(x.is_open), label: x.is_open ? `${hLabel(x.opens_at)} – ${hLabel(x.closes_at)}` : 'Fermé' }))
    .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7));
}
