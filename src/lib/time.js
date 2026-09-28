// Gestion des dates en heure de Paris, quel que soit le fuseau du serveur.
export const TZ = 'Europe/Paris';

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
});
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Date/heure locale de Paris : { date: 'AAAA-MM-JJ', time: 'HH:MM', weekday: 0-6, minutes } */
export function parisNow(d = new Date()) {
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${hour}:${p.minute}`,
    weekday: WD[p.weekday],
    minutes: Number(hour) * 60 + Number(p.minute),
  };
}

export const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Ajoute n jours à une date AAAA-MM-JJ. */
export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const weekdayOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();

export const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « Aujourd'hui », « Demain » ou « Samedi 3 octobre » */
export function dayLabel(date, today = parisNow().date) {
  if (date === today) return "Aujourd'hui";
  if (date === addDays(today, 1)) return 'Demain';
  const [, m, d] = date.split('-').map(Number);
  return `${WEEKDAYS[weekdayOf(date)]} ${d} ${MONTHS[m - 1]}`;
}
export function shortDate(date) {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}
export const hLabel = (hhmm) => hhmm.replace(':00', 'h').replace(':', 'h');

const dtFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const tFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
export const fmtDateTime = (iso) => (iso ? dtFmt.format(new Date(iso)) : '');
export const fmtTime = (iso) => (iso ? tFmt.format(new Date(iso)) : '');

/** Instant UTC (ISO) correspondant à une date/heure de Paris. */
export function parisToUtc(date, hhmm) {
  const guess = new Date(`${date}T${hhmm}:00Z`);
  const local = parisNow(guess);
  const diff = (toMinutes(local.time) - toMinutes(hhmm)) + (local.date > date ? 1440 : local.date < date ? -1440 : 0);
  return new Date(guess.getTime() - diff * 60000);
}
