// Coordonnées de la boutique (modifiables dans Admin → Horaires → Coordonnées de la boutique).
import { getSetting } from '../db.js';

export const SHOP_DEFAULTS = { name: 'Maison Green', address: '42 rue de la République', postal: '76000', city: 'Rouen', phone: '', email: 'bonjour@maisongreen.fr' };
// Valeurs fictives des premières versions : considérées comme non renseignées.
const LEGACY = { address: '12 rue du Gros-Horloge', phone: '02 35 00 00 00' };

export function shopInfo() {
  const s = { ...SHOP_DEFAULTS, ...getSetting('shop', {}) };
  for (const [k, v] of Object.entries(LEGACY)) if (s[k] === v) s[k] = SHOP_DEFAULTS[k];
  return { ...s, tel: s.phone ? `tel:${s.phone.replace(/\s/g, '')}` : '', fullAddress: `${s.address}, ${s.postal} ${s.city}` };
}
