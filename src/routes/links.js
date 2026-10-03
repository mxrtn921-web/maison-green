// Page « liens » pour la carte NFC de la boutique : avis Google, site, itinéraire, appel.
import { get } from '../router.js';
import { send, redirect } from '../lib/http.js';
import { hoursSummary, shopOpenNow } from '../services/delivery.js';

const PLACE_ID = 'ChIJ9c9DrUbf4EcRdV3a8GmDT8s';
const REVIEW_URL = `https://search.google.com/local/writereview?placeid=${PLACE_ID}`;
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=Maison+Green+Rouen&query_place_id=${PLACE_ID}`;

const ICONS = {
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  bag: '<path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

function page() {
  const open = shopOpenNow();
  const label = hoursSummary()[0]?.label || '';
  const link = (href, ic, title, sub, main = false, ext = true) => `
    <a class="lk${main ? ' main' : ''}" href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}>
      <span class="ic">${icon(ic)}</span><span class="tx"><strong>${title}</strong><small>${sub}</small></span><span class="go">${icon('arrow')}</span>
    </a>`;
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Maison Green — Rouen</title>
<meta name="description" content="Maison Green, épicerie de quartier rue de la République à Rouen : laissez-nous un avis, commandez en ligne ou venez nous voir.">
<meta name="theme-color" content="#1E3B2F">
<link rel="icon" href="/img/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
<style>
@font-face{font-family:'Lora';src:url('/fonts/Lora-Variable.woff') format('woff');font-weight:400 700;font-display:swap}
@font-face{font-family:'Lora';src:url('/fonts/Lora-Italic-Variable.woff') format('woff');font-weight:400 700;font-style:italic;font-display:swap}
:root{--g:#1E3B2F;--g2:#2C5442;--ink:#16211c;--mut:#5f6b65;--bg:#f6f3ec;--card:#fff;--line:#e6e1d6;--gold:#d9a521}
*{box-sizing:border-box;margin:0}
body{min-height:100dvh;font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;color:var(--ink);
  background:radial-gradient(120% 60% at 50% 0%,#e3ece5 0%,var(--bg) 60%);display:flex;justify-content:center;padding:max(28px,env(safe-area-inset-top)) 18px 32px}
.wrap{width:100%;max-width:440px;display:flex;flex-direction:column;align-items:center}
.logo{width:84px;height:84px;border-radius:22px;background:var(--g);display:grid;place-items:center;box-shadow:0 10px 30px -12px rgba(30,59,47,.55)}
.logo span{font:500 32px/1 Lora,Georgia,serif;color:#fff;letter-spacing:-1px}
h1{font:500 30px/1.15 Lora,Georgia,serif;margin-top:18px;letter-spacing:-.02em}
h1 em{color:var(--g2)}
.sub{color:var(--mut);margin-top:6px;text-align:center}
.status{display:inline-flex;align-items:center;gap:8px;margin-top:14px;padding:6px 12px;border-radius:99px;background:var(--card);border:1px solid var(--line);font-size:14px}
.dot{width:8px;height:8px;border-radius:50%;background:${open ? '#2e9d5b' : '#b8b2a6'};box-shadow:${open ? '0 0 0 4px rgba(46,157,91,.15)' : 'none'}}
.links{width:100%;display:flex;flex-direction:column;gap:12px;margin-top:26px}
.lk{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:18px;background:var(--card);border:1px solid var(--line);color:inherit;text-decoration:none;
  transition:transform .15s ease,box-shadow .15s ease}
.lk:active{transform:scale(.98)}
@media (hover:hover){.lk:hover{transform:translateY(-2px);box-shadow:0 12px 26px -16px rgba(0,0,0,.35)}}
.lk .ic{flex:none;width:44px;height:44px;border-radius:13px;background:#eef3ef;display:grid;place-items:center}
.lk svg{width:22px;height:22px;fill:none;stroke:var(--g);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.lk .tx{flex:1;display:flex;flex-direction:column;min-width:0}
.lk strong{font-weight:600;font-size:16px}
.lk small{color:var(--mut);font-size:13.5px}
.lk .go svg{width:18px;height:18px;stroke:var(--mut)}
.lk.main{background:var(--g);border-color:var(--g);color:#fff;padding:18px 16px}
.lk.main .ic{background:rgba(255,255,255,.12)}
.lk.main .ic svg{fill:var(--gold);stroke:var(--gold)}
.lk.main small{color:rgba(255,255,255,.75)}
.lk.main .go svg{stroke:#fff}
.stars{color:var(--gold);letter-spacing:2px;font-size:15px;margin-top:3px}
.addr{margin-top:28px;text-align:center;color:var(--mut);font-size:14px}
.addr a{color:var(--g2)}
</style></head>
<body><main class="wrap">
  <div class="logo" aria-hidden="true"><span>MG</span></div>
  <h1>Maison <em>Green</em></h1>
  <p class="sub">Votre épicerie de quartier à Rouen,<br>livrée à votre porte.</p>
  <span class="status"><span class="dot"></span>${open ? 'Ouvert maintenant' : 'Fermé pour le moment'} · ${label}</span>
  <nav class="links" aria-label="Liens Maison Green">
    ${link('/avis', 'star', 'Laissez-nous un avis Google', 'Une minute pour nous aider, merci !', true, false)}
    ${link('/', 'bag', 'Commander en ligne', 'Livraison à Rouen, 7j/7', false, false)}
    ${link(MAPS_URL, 'pin', 'Venir à la boutique', '42 rue de la République, Rouen')}
  </nav>
  <p class="addr">© Maison Green · <a href="/mentions-legales">Mentions légales</a></p>
</main></body></html>`;
}

get('/liens', (ctx) => send(ctx.res, 200, page(), 'text/html; charset=utf-8', { 'Cache-Control': 'no-cache' }));
get('/nfc', (ctx) => redirect(ctx.res, '/liens'));
get('/avis', (ctx) => redirect(ctx.res, REVIEW_URL));
