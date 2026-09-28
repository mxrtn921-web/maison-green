// Chiffre d'affaires : par mois et par année (heure de Paris). Toutes les commandes sont conservées en base.
import { one, all } from '../db.js';
import { parisNow, parisToUtc } from '../lib/time.js';

export const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
// Commandes comptées : tout sauf annulées et cartes jamais payées.
const VALID = "o.status NOT IN ('cancelled','awaiting_payment')";
const monthStart = (y, m) => parisToUtc(`${y}-${String(m).padStart(2, '0')}-01`, '00:00').toISOString();
const next = (y, m) => (m === 12 ? [y + 1, 1] : [y, m + 1]);

function period(from, to) {
  const r = one(`SELECT COUNT(*) AS count, COALESCE(SUM(o.total_cents),0) AS gross, COALESCE(SUM(o.delivery_fee_cents),0) AS delivery,
      COALESCE(SUM(CASE WHEN o.payment_method = 'card' THEN o.total_cents END),0) AS card,
      COALESCE(SUM(CASE WHEN o.payment_method = 'cash' THEN o.total_cents END),0) AS cash,
      COALESCE(SUM((SELECT COALESCE(SUM(p.refunded_cents),0) FROM payments p WHERE p.order_id = o.id)),0) AS refunded
    FROM orders o WHERE ${VALID} AND o.created_at >= ? AND o.created_at < ?`, from, to);
  const net = r.gross - r.refunded;
  return { ...r, net, products: net - r.delivery, avg: r.count ? Math.round(net / r.count) : 0 };
}

/** Années pour lesquelles il existe au moins une commande (+ l'année en cours). */
export function years() {
  const first = one(`SELECT MIN(created_at) AS d FROM orders o WHERE ${VALID}`).d;
  const now = Number(parisNow().date.slice(0, 4));
  const start = first ? Number(parisNow(new Date(first)).date.slice(0, 4)) : now;
  const out = []; for (let y = now; y >= start; y--) out.push(y);
  return out;
}

export function yearReport(year) {
  const today = parisNow().date;
  const months = MONTHS.map((label, i) => {
    const m = i + 1; const [ny, nm] = next(year, m);
    const future = `${year}-${String(m).padStart(2, '0')}-01` > today;
    return { month: m, label, future, ...period(monthStart(year, m), monthStart(ny, nm)) };
  });
  const total = period(monthStart(year, 1), monthStart(year + 1, 1));
  // Comparaison à date : même période l'année précédente (du 1er janvier au même jour).
  const isCurrent = today.startsWith(String(year));
  const sameDayLastYear = `${year - 1}${today.slice(4)}`.replace('-02-29', '-02-28');
  const prev = isCurrent
    ? period(monthStart(year - 1, 1), parisToUtc(sameDayLastYear, '23:59').toISOString())
    : period(monthStart(year - 1, 1), monthStart(year, 1));
  return { year, months, total, prev, isCurrent };
}

/** Détail des commandes d'une année (export pour la comptabilité). */
export function yearOrders(year) {
  return all(`SELECT o.number, o.created_at, o.status, o.first_name, o.last_name, o.payment_method, o.payment_status,
      o.subtotal_cents, o.delivery_fee_cents, o.total_cents,
      (SELECT COALESCE(SUM(p.refunded_cents),0) FROM payments p WHERE p.order_id = o.id) AS refunded_cents
    FROM orders o WHERE ${VALID} AND o.created_at >= ? AND o.created_at < ? ORDER BY o.created_at`, monthStart(year, 1), monthStart(year + 1, 1))
    .map((o) => ({ ...o, paris: parisNow(new Date(o.created_at)) }));
}
