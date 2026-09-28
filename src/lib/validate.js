// Validation côté serveur (toutes les entrées passent par ici).
// Chaque règle renvoie [valeur, erreur?]. Les messages sont écrits pour le client final.

const s = (v) => (v === undefined || v === null ? '' : String(v)).trim();

export const v = {
  text: ({ label = 'Ce champ', min = 0, max = 200, required = true } = {}) => (raw) => {
    const val = s(raw).replace(/\s+/g, ' ');
    if (!val && required) return [val, `${label} est obligatoire.`];
    if (val && val.length < min) return [val, `${label} doit contenir au moins ${min} caractères.`];
    if (val.length > max) return [val, `${label} ne doit pas dépasser ${max} caractères.`];
    return [val];
  },
  longText: ({ label = 'Ce champ', max = 2000, required = false } = {}) => (raw) => {
    const val = s(raw);
    if (!val && required) return [val, `${label} est obligatoire.`];
    if (val.length > max) return [val, `${label} ne doit pas dépasser ${max} caractères.`];
    return [val];
  },
  email: ({ required = true } = {}) => (raw) => {
    const val = s(raw).toLowerCase();
    if (!val) return [val, required ? "L'adresse e-mail est obligatoire." : undefined];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val) || val.length > 160) return [val, "Cette adresse e-mail ne semble pas valide."];
    return [val];
  },
  phone: ({ required = true } = {}) => (raw) => {
    const digits = s(raw).replace(/[^\d+]/g, '');
    if (!digits) return ['', required ? 'Le téléphone est obligatoire pour que le livreur puisse vous joindre.' : undefined];
    let n = digits.replace(/^\+33/, '0').replace(/^0033/, '0');
    if (!/^0[1-9]\d{8}$/.test(n)) return [s(raw), 'Indiquez un numéro à 10 chiffres, par exemple 06 12 34 56 78.'];
    return [n.replace(/(\d{2})(?=\d)/g, '$1 ')];
  },
  postal: () => (raw) => {
    const val = s(raw).replace(/\s/g, '');
    if (!/^\d{5}$/.test(val)) return [val, 'Le code postal doit comporter 5 chiffres.'];
    return [val];
  },
  password: ({ min = 10 } = {}) => (raw) => {
    const val = String(raw ?? '');
    if (val.length < min) return [val, `Le mot de passe doit contenir au moins ${min} caractères.`];
    if (val.length > 200) return [val, 'Mot de passe trop long.'];
    return [val];
  },
  int: ({ label = 'Ce nombre', min = 0, max = 1e9, required = true } = {}) => (raw) => {
    const str = s(raw);
    if (!str) return required ? [0, `${label} est obligatoire.`] : [null];
    if (!/^-?\d+$/.test(str)) return [str, `${label} doit être un nombre entier.`];
    const n = Number(str);
    if (n < min || n > max) return [n, `${label} doit être compris entre ${min} et ${max}.`];
    return [n];
  },
  /** Prix saisi en euros (« 2,50 » ou « 2.5 ») → centimes */
  money: ({ label = 'Le prix', required = true, max = 100000 } = {}) => (raw) => {
    const str = s(raw).replace(/\s|€/g, '').replace(',', '.');
    if (!str) return required ? [0, `${label} est obligatoire.`] : [null];
    if (!/^\d+(\.\d{1,2})?$/.test(str)) return [raw, `${label} doit être un montant, par exemple 2,50.`];
    const cents = Math.round(Number(str) * 100);
    if (cents > max * 100) return [raw, `${label} est trop élevé.`];
    return [cents];
  },
  bool: () => (raw) => [raw === true || raw === 'on' || raw === '1' || raw === 'true' || raw === 1],
  oneOf: (list, msg = 'Choix invalide.') => (raw) => (list.includes(raw) ? [raw] : [raw, msg]),
  time: ({ label = "L'heure" } = {}) => (raw) => {
    const val = s(raw);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(val)) return [val, `${label} doit être au format HH:MM.`];
    return [val];
  },
  date: ({ label = 'La date' } = {}) => (raw) => {
    const val = s(raw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val) || Number.isNaN(Date.parse(val))) return [val, `${label} est invalide.`];
    return [val];
  },
};

/** Valide un objet d'entrée selon un schéma { champ: règle }. */
export function validate(schema, input = {}) {
  const data = {}; const errors = {};
  for (const [key, rule] of Object.entries(schema)) {
    const [val, err] = rule(input[key]);
    data[key] = val;
    if (err) errors[key] = err;
  }
  return { data, errors, ok: Object.keys(errors).length === 0 };
}

export const slugify = (str) => String(str).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'produit';
