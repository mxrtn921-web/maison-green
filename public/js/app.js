/* Maison Green — interactions côté navigateur (sans framework).
   Panier (stockage local), tiroir, commande, suivi en direct, temps réel admin/livreur. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const money = (c) => eur.format((c || 0) / 100).replace(/ /g, ' ');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ICON = {
    plus: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    trash: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.8 12.2a1.5 1.5 0 0 0 1.5 1.3h6.4a1.5 1.5 0 0 0 1.5-1.3L17.5 7"/></svg>',
    arrow: '<svg class="icon arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    alert: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 2.8 19.5h18.4L12 4Z"/><path d="M12 10v4.5M12 17h.01"/></svg>',
  };
  // ——— Toucher une alerte push : ouvrir la bonne page (course, commande) ———————————
  // Le service worker envoie un message à la page ouverte ; si l'app était fermée ou en veille (iPhone),
  // la page réclame elle-même la course mémorisée dès qu'elle s'affiche.
  if ('serviceWorker' in navigator) {
    const go = (url) => {
      if (!url) return;
      const target = new URL(url, location.origin);
      if (target.origin !== location.origin) return;
      if (target.pathname + target.search !== location.pathname + location.search) location.replace(target.href);
    };
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'navigate') { fetch('/__mg/pending-nav', { cache: 'no-store' }).catch(() => {}); go(e.data.url); } });
    const claim = () => {
      if (!navigator.serviceWorker.controller) return;
      fetch('/__mg/pending-nav', { cache: 'no-store' }).then((r) => r.json()).then((d) => go(d.url)).catch(() => {});
    };
    claim();
    addEventListener('pageshow', claim);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') claim(); });
  }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  async function api(url, body) {
    const r = await fetch(url, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  }

  // ——— Généralités ————————————————————————————————————————————
  const header = $('[data-header]');
  if (header) { const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 4); onScroll(); addEventListener('scroll', onScroll, { passive: true }); }
  $$('[data-autohide]').forEach((el) => setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 400); }, 4200));
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-autosubmit], [data-autosubmit-change]')) t.form?.requestSubmit ? t.form.requestSubmit() : t.form?.submit();
  });
  document.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-href]');
    if (row && !e.target.closest('a, button, input, select, form')) location.href = row.dataset.href;
  });

  // Confirmation élégante (remplace window.confirm)
  function confirmDialog(message) {
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.className = 'panel';
      d.style.cssText = 'max-width:420px;width:calc(100% - 32px);padding:0;border:1px solid var(--line);border-radius:14px';
      d.innerHTML = `<div class="panel-body"><p style="font-size:16px;line-height:1.45">${esc(message)}</p><div class="row mt-24" style="justify-content:flex-end"><button class="btn btn-ghost btn-sm" value="no">Annuler</button><button class="btn btn-dark btn-sm" value="yes">Confirmer</button></div></div>`;
      document.body.appendChild(d);
      d.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (b) { d.close(); resolve(b.value === 'yes'); d.remove(); } else if (ev.target === d) { d.close(); resolve(false); d.remove(); } });
      d.addEventListener('cancel', () => { resolve(false); d.remove(); });
      d.showModal();
      $('button[value="yes"]', d).focus();
    });
  }
  document.addEventListener('submit', async (e) => {
    const f = e.target;
    const btn = e.submitter;
    const msg = btn?.dataset.confirmClick || (btn?.getAttribute('formaction') ? null : f.dataset.confirm);
    if (!msg || f.dataset.confirmed) return;
    e.preventDefault();
    if (await confirmDialog(msg)) { f.dataset.confirmed = '1'; if (btn?.getAttribute('formaction')) f.action = btn.getAttribute('formaction'); f.submit(); }
  });

  // Aperçu de la photo produit avant envoi (admin)
  document.addEventListener('change', (e) => {
    const inp = e.target;
    if (!inp.matches('input[type="file"][name="image"]') || !inp.files[0]) return;
    const tag = inp.closest('.image-drop')?.querySelector('.tag');
    if (!tag) return;
    tag.classList.add('photo'); tag.innerHTML = '';
    const img = document.createElement('img'); img.alt = 'Aperçu'; img.src = URL.createObjectURL(inp.files[0]); tag.appendChild(img);
    compressImage(inp);
  });

  // Compression des photos avant envoi : 1200 px maximum, WebP (ou JPEG sur les vieux iPhone).
  // Une photo de téléphone de 3-5 Mo devient ~100-250 Ko : pages plus rapides et moins de stockage.
  async function compressImage(inp) {
    const file = inp.files[0];
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type) || !window.createImageBitmap || !window.DataTransfer) return;
    const form = inp.form; const buttons = form ? $$('button[type="submit"], button:not([type])', form) : [];
    buttons.forEach((b) => { b.disabled = true; });
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const scale = Math.min(1, 1200 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
      const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height); g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const toBlob = (type, q) => new Promise((ok) => canvas.toBlob(ok, type, q));
      let blob = await toBlob('image/webp', 0.82);
      if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.85);
      if (blob && blob.size < file.size) {
        const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
        const dt = new DataTransfer(); dt.items.add(new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.${ext}`, { type: blob.type }));
        inp.files = dt.files;
      }
    } catch { /* on garde le fichier d'origine */ }
    buttons.forEach((b) => { b.disabled = false; });
  }

  // ——— Mes commandes (sans compte) : le téléphone garde le lien de suivi ———————————
  // Le client retrouve sa commande en rouvrant le site, sans e-mail ni compte.
  const ORDERS_KEY = 'mg_orders_v1'; const KEEP_MS = 3 * 864e5;
  const savedOrders = () => { try { const v = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]'); return Array.isArray(v) ? v.filter((o) => o && o.token && Date.now() - o.at < KEEP_MS) : []; } catch { return []; } };
  const trackMatch = /^\/suivi\/([A-Za-z0-9_-]{10,64})$/.exec(location.pathname);
  if (trackMatch) {
    const number = (/Commande (MG-\d+)/.exec(document.body.textContent) || [])[1] || '';
    const list = savedOrders().filter((o) => o.token !== trackMatch[1]);
    const prev = savedOrders().find((o) => o.token === trackMatch[1]);
    list.unshift({ token: trackMatch[1], number, at: prev?.at || Date.now() });
    try { localStorage.setItem(ORDERS_KEY, JSON.stringify(list.slice(0, 5))); } catch { /* navigation privée */ }
  } else if (!$('[data-pro]') && !/^\/(admin|livreur|paiement-demo)/.test(location.pathname)) {
    const mine = savedOrders();
    const main = $('main#contenu');
    if (mine.length && main) {
      const bar = document.createElement('div'); bar.className = 'track-reminder';
      bar.innerHTML = `<div class="wrap">${mine.slice(0, 2).map((o) => `<a href="/suivi/${esc(o.token)}"><span>Suivre ma commande${o.number ? ` <strong>${esc(o.number)}</strong>` : ''}</span><span aria-hidden="true">→</span></a>`).join('')}</div>`;
      main.parentNode.insertBefore(bar, main);
    }
  }

  // ——— Bandeau cookies : information (le site n'utilise aucun traceur, donc aucun consentement à demander) ———
  if (!$('[data-pro]')) {
    let seenNote = false; try { seenNote = localStorage.getItem('mg_cookie_note') === '1'; } catch { seenNote = true; }
    if (!seenNote) {
      const note = document.createElement('div'); note.className = 'cookie-note'; note.setAttribute('role', 'region'); note.setAttribute('aria-label', 'Cookies');
      note.innerHTML = '<span>Ici, pas de pub ni de pistage : uniquement les cookies nécessaires (connexion, panier) et une mesure d’audience anonyme. <a href="/confidentialite">En savoir plus</a></span><button type="button">OK</button>';
      $('button', note).addEventListener('click', () => { try { localStorage.setItem('mg_cookie_note', '1'); } catch { /* navigation privée */ } note.remove(); });
      document.body.appendChild(note);
    }
  }

  // ——— Panier ————————————————————————————————————————————————
  const KEY = 'mg_cart_v1';
  const cart = {
    read() { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter((i) => i && i.id && i.qty > 0) : []; } catch { return []; } },
    write(items) { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* navigation privée : le panier reste en mémoire */ } memory = items; },
    items() { return memory; },
    qty(id) { return memory.find((i) => i.id === id)?.qty || 0; },
    set(id, qty, max = 99) {
      const items = memory.filter((i) => i.id !== id);
      const q = Math.max(0, Math.min(qty, max));
      if (q > 0) { const idx = memory.findIndex((i) => i.id === id); items.splice(idx < 0 ? items.length : idx, 0, { id, qty: q }); }
      this.write(items); onCartChange();
    },
    clear() { this.write([]); onCartChange(); },
  };
  let memory = cart.read();
  let quote = null;

  const count = () => memory.reduce((s, i) => s + i.qty, 0);
  function paintCounts() {
    const n = count();
    $$('[data-cart-count]').forEach((el) => { el.textContent = n; });
    document.body.classList.toggle('has-cart', n > 0 && !$('[data-checkout]'));
    const lbl = $('[data-cart-bar-label]');
    if (lbl) lbl.textContent = `Voir le panier · ${n} article${n > 1 ? 's' : ''}`;
    const tot = $('[data-cart-bar-total]');
    if (tot) tot.textContent = quote ? money(quote.subtotal) : '…';
  }
  function paintAddControls() {
    $$('[data-add]').forEach((box) => {
      const id = Number(box.dataset.add); const max = Number(box.dataset.max) || 99; const q = cart.qty(id);
      const big = box.querySelector('.btn-lg') || box.dataset.big;
      if (big) box.dataset.big = '1';
      if (q > 0) {
        box.innerHTML = `<div class="stepper${box.dataset.big ? '' : ''}" role="group" aria-label="Quantité de ${esc(box.dataset.name)}">
          <button type="button" data-act="dec" aria-label="Retirer un">${ICON.minus}</button><output aria-live="polite">${q}</output>
          <button type="button" data-act="inc" aria-label="Ajouter un" ${q >= max ? 'disabled style="opacity:.4"' : ''}>${ICON.plus}</button></div>`;
      } else {
        box.innerHTML = `<button type="button" class="add-btn${box.dataset.big ? ' btn-lg' : ''}" data-act="add" aria-label="Ajouter ${esc(box.dataset.name)} au panier">${ICON.plus}<span class="add-label">${box.dataset.big ? 'Ajouter au panier' : 'Ajouter'}</span></button>`;
      }
    });
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const box = b.closest('[data-add], [data-line]');
    if (!box) return;
    const id = Number(box.dataset.add || box.dataset.line);
    const max = Number(box.dataset.max) || 99;
    const q = cart.qty(id);
    if (b.dataset.act === 'add' || b.dataset.act === 'inc') {
      if (q >= max) return;
      cart.set(id, q + 1, max);
      const btn = $('.cart-btn'); btn?.classList.remove('bump'); void btn?.offsetWidth; btn?.classList.add('bump');
    } else if (b.dataset.act === 'dec') cart.set(id, q - 1, max);
    else if (b.dataset.act === 'remove') cart.set(id, 0);
  });

  const refreshQuote = debounce(async () => {
    const postal = $('[data-postal]')?.value || '';
    const { ok, data } = await api('/api/cart/quote', { items: memory, postal_code: postal });
    if (!ok) return;
    quote = data;
    // Le serveur fait foi : on aligne le panier local (produit retiré, stock limité…).
    const fixed = data.lines.map((l) => ({ id: l.id, qty: l.quantity }));
    if (JSON.stringify(fixed) !== JSON.stringify(memory)) { cart.write(fixed); paintAddControls(); }
    paintCounts(); renderDrawer(); renderSummary();
  }, 120);
  function onCartChange() { paintCounts(); paintAddControls(); renderDrawerOptimistic(); refreshQuote(); }

  // Tiroir
  const drawer = $('[data-cart-drawer]'); const backdrop = $('[data-cart-backdrop]');
  let lastFocus = null;
  function openCart() {
    if (!drawer) return;
    lastFocus = document.activeElement;
    drawer.hidden = false; backdrop.hidden = false;
    requestAnimationFrame(() => { drawer.classList.add('open'); backdrop.classList.add('open'); });
    document.documentElement.style.overflow = 'hidden';
    $('[data-close-cart]', drawer)?.focus();
    refreshQuote();
  }
  function closeCart() {
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove('open'); backdrop.classList.remove('open');
    document.documentElement.style.overflow = '';
    setTimeout(() => { drawer.hidden = true; backdrop.hidden = true; }, 320);
    lastFocus?.focus?.();
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-cart]')) { e.preventDefault(); openCart(); }
    if (e.target.closest('[data-close-cart]') || e.target === backdrop) closeCart();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCart();
    if (e.key === 'Tab' && drawer && !drawer.hidden) {
      const f = $$('button, a[href], input', drawer).filter((x) => !x.disabled);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  const lineHtml = (l, compact = false) => `
    <div class="line" data-line="${l.id}" data-max="${l.max}">
      <div class="tag ${l.image_url ? 'photo' : ''} tone-${esc(l.tone || 'stone')}" data-initial="${esc(l.name[0])}" aria-hidden="true">${l.image_url ? `<img src="${esc(l.image_url)}" alt="">` : ''}</div>
      <div><div class="line-name">${compact ? `<span class="qty-dot">${l.quantity}×</span> ` : ''}${esc(l.name)}</div><div class="line-meta">${esc(l.unit)} · ${money(l.unit_price_cents)}</div></div>
      <div class="line-right"><span class="line-total">${money(l.line_total_cents)}</span>
        ${compact ? '' : `<div class="stepper light" role="group" aria-label="Quantité de ${esc(l.name)}"><button type="button" data-act="dec" aria-label="Retirer un">${l.quantity === 1 ? ICON.trash : ICON.minus}</button><output>${l.quantity}</output><button type="button" data-act="inc" aria-label="Ajouter un" ${l.quantity >= l.max ? 'disabled style="opacity:.35"' : ''}>${ICON.plus}</button></div>`}
      </div>
    </div>`;

  function renderDrawerOptimistic() {
    if (!quote || !drawer) return;
    quote.lines = quote.lines.map((l) => ({ ...l, quantity: cart.qty(l.id), line_total_cents: cart.qty(l.id) * l.unit_price_cents })).filter((l) => l.quantity > 0);
    quote.subtotal = quote.lines.reduce((s, l) => s + l.line_total_cents, 0);
    renderDrawer();
  }
  function renderDrawer() {
    const body = $('[data-cart-body]'); const foot = $('[data-cart-foot]');
    if (!body) return;
    if (!memory.length) {
      body.innerHTML = `<div class="empty" style="padding:48px 8px"><h3 class="h2" style="font-size:24px">Votre panier est vide</h3><p>Commencez par les incontournables de la semaine.</p><a class="btn btn-primary" href="/boutique">Parcourir la boutique</a></div>`;
      foot.innerHTML = ''; foot.hidden = true; return;
    }
    foot.hidden = false;
    if (!quote) { body.innerHTML = '<p class="muted" style="padding:24px 0">Chargement…</p>'; return; }
    const issues = (quote.issues || []).map((i) => `<div class="notice notice-warn mt-8">${ICON.alert}<span>${esc(i.message)}</span></div>`).join('');
    body.innerHTML = issues + quote.lines.map((l) => lineHtml(l)).join('');
    const min = quote.zone ? quote.zone.min : quote.min_order;
    const missing = Math.max(0, min - quote.subtotal);
    foot.innerHTML = `
      ${missing ? `<div><p class="small" style="margin-bottom:6px">Plus que <strong>${money(missing)}</strong> pour atteindre le minimum de commande.</p><div class="progress"><i style="width:${Math.min(100, (quote.subtotal / min) * 100)}%"></i></div></div>` : ''}
      <div class="totals">
        <div><span>Sous-total</span><span class="price">${money(quote.subtotal)}</span></div>
        <div class="muted"><span>Livraison</span><span>${quote.zone ? (quote.zone.fee ? money(quote.zone.fee) : 'Offerte') : `dès ${money(quote.min_fee)}`}</span></div>
      </div>
      <a class="btn btn-primary btn-lg btn-block" href="/commande" ${missing ? 'aria-disabled="true"' : ''}>Passer la commande ${ICON.arrow}</a>`;
  }

  // Recommander depuis le compte
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-reorder]');
    if (!b) return;
    try { for (const it of JSON.parse(b.dataset.reorder)) cart.set(Number(it.id), cart.qty(Number(it.id)) + Number(it.qty)); } catch { /* ignore */ }
    openCart();
  });

  // ——— Zones (accueil) ———————————————————————————————————————
  const zc = $('[data-zone-check]');
  if (zc) zc.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cp = zc.cp.value.trim(); const out = $('[data-zone-result]');
    if (!/^\d{5}$/.test(cp)) { out.innerHTML = '<span style="color:var(--danger)">Indiquez un code postal à 5 chiffres.</span>'; return; }
    const { data } = await api(`/api/zone?cp=${cp}`);
    out.innerHTML = data.ok
      ? `<span style="color:var(--green-2)">Oui, nous livrons au ${cp} (${esc(data.name)}).</span> Livraison ${esc(data.fee_label)}, minimum ${esc(data.min_label)}.`
      : `<span style="color:var(--danger)">Pas encore de livraison au ${cp}.</span> Écrivez-nous : nous étendons nos zones selon la demande.`;
  });

  // ——— Recherche en direct (boutique) —————————————————————————————
  const live = $('[data-live-search]');
  if (live) {
    const run = debounce(async () => {
      const f = live.form; const params = new URLSearchParams(new FormData(f));
      if (!live.value.trim()) params.delete('q');
      const url = `/boutique${params.toString() ? `?${params}` : ''}`;
      const html = await fetch(url, { credentials: 'same-origin' }).then((r) => r.text());
      const doc = new DOMParser().parseFromString(html, 'text/html');
      $('[data-results]').innerHTML = $('[data-results]', doc).innerHTML;
      $('.chips').innerHTML = $('.chips', doc).innerHTML;
      history.replaceState(null, '', url);
      paintAddControls();
    }, 280);
    live.addEventListener('input', run);
    live.form.addEventListener('submit', (e) => { e.preventDefault(); run(); live.blur(); });
    if (location.hash === '#recherche') setTimeout(() => live.focus(), 50);
  }

  // ——— Commande ———————————————————————————————————————————————
  const co = $('[data-checkout-form]');
  function renderSummary() {
    const adultBox = $('[data-adult-box]');
    if (adultBox) { const need = Boolean(quote?.adult); adultBox.hidden = !need; const cb = $('input[name="adult_ok"]', adultBox); if (cb) cb.required = need; }
    const box = $('[data-summary-lines]');
    if (!box) return;
    if (!memory.length) { box.innerHTML = '<p class="muted small" style="padding:12px 0">Votre panier est vide. <a class="link" href="/boutique">Retour à la boutique</a></p>'; $('[data-summary-totals]').innerHTML = ''; $('[data-submit]').disabled = true; return; }
    if (!quote) return;
    box.innerHTML = quote.lines.map((l) => lineHtml(l, true)).join('');
    const fee = quote.zone ? quote.zone.fee : null;
    const total = quote.subtotal + (fee || 0);
    const missing = quote.zone ? Math.max(0, quote.zone.min - quote.subtotal) : 0;
    $('[data-summary-totals]').innerHTML = `
      <div class="muted"><span>Sous-total</span><span class="price">${money(quote.subtotal)}</span></div>
      <div class="muted"><span>Livraison${quote.zone ? ` · ${esc(quote.zone.name)}` : ''}</span><span>${fee === null ? 'selon code postal' : fee ? money(fee) : 'Offerte'}</span></div>
      <div class="grand"><span>Total</span><span class="price">${money(total)}</span></div>
      ${missing ? `<div class="notice notice-warn mt-8" style="font-size:13px">${ICON.alert}<span>Minimum de commande pour cette zone : ${money(quote.zone.min)}. Il manque ${money(missing)}.</span></div>` : ''}`;
    const peek = $('[data-sum-peek]'); if (peek) peek.textContent = `${count()} article${count() > 1 ? 's' : ''} · ${money(total)}`;
    const label = $('[data-submit-label]');
    if (label) label.textContent = `Payer ${money(total)}`;
  }
  if (co) {
    const data = JSON.parse($('#checkout-data').textContent);
    const postal = $('[data-postal]'); const hint = $('[data-zone-hint]');
    const checkZone = () => {
      const cp = postal.value.trim();
      const z = data.zones.find((x) => x.codes.includes(cp));
      if (cp.length < 5) { hint.textContent = ''; hint.className = 'zone-hint'; }
      else if (z) { hint.textContent = `${z.name} · livraison ${z.fee ? money(z.fee) : 'offerte'}, minimum ${money(z.min)}`; hint.className = 'zone-hint ok'; }
      else { hint.textContent = 'Nous ne livrons pas encore ce code postal.'; hint.className = 'zone-hint ko'; }
      refreshQuote();
    };
    postal.addEventListener('input', checkZone); checkZone();
    $$('[data-day]').forEach((b) => b.addEventListener('click', () => {
      $$('[data-day]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $$('[data-slots-for]').forEach((s) => { s.hidden = s.dataset.slotsFor !== b.dataset.day; });
    }));
    const det = $('[data-sum-details]'); if (det && matchMedia('(max-width: 999px)').matches) det.open = false;
    co.addEventListener('input', (e) => { const f = e.target.closest('.field.has-error'); if (f) { f.classList.remove('has-error'); $$('.error-text', f).forEach((x) => x.remove()); } });
    co.addEventListener('change', (e) => { if (e.target.name === 'slot' || e.target.name === 'accept_terms') { const x = $(`[data-err="${e.target.name}"]`); if (x) x.hidden = true; } });
    const firstFree = $('input[name="slot"]:not(:disabled)'); if (firstFree) firstFree.checked = true;
    $$('[data-address]').forEach((b) => b.addEventListener('click', () => {
      const a = JSON.parse(b.dataset.address);
      for (const [k, v] of Object.entries(a)) if (co.elements[k]) co.elements[k].value = v || '';
      $$('[data-address]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      checkZone();
    }));
    co.addEventListener('change', (e) => { if (e.target.name === 'payment_method') renderSummary(); });

    const clearErrors = () => { $$('.field.has-error', co).forEach((f) => f.classList.remove('has-error')); $$('.error-text[data-js]', co).forEach((x) => x.remove()); $$('[data-err]').forEach((x) => { x.hidden = true; }); $('[data-form-error]').hidden = true; };
    co.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();
      const btn = $('[data-submit]'); const label = $('[data-submit-label]'); const prev = label.textContent;
      btn.disabled = true; label.textContent = 'Envoi…';
      const fd = new FormData(co); const body = Object.fromEntries(fd.entries());
      body.accept_terms = fd.has('accept_terms'); body.adult_ok = fd.has('adult_ok'); body.save_address = fd.has('save_address'); body.items = memory;
      try {
        const { ok, data: res } = await api('/api/orders', body);
        if (ok && res.redirect) { cart.clear(); location.href = res.redirect; return; }
        const errors = res.errors || {};
        let first = null;
        for (const [k, msg] of Object.entries(errors)) {
          const slotBox = $(`[data-err="${k}"]`);
          if (slotBox) { slotBox.innerHTML = `${ICON.alert}${esc(msg)}`; slotBox.hidden = false; first ||= slotBox; continue; }
          const input = co.elements[k];
          if (input && input.closest) {
            const field = input.closest('.field'); field?.classList.add('has-error');
            const p = document.createElement('p'); p.className = 'error-text'; p.dataset.js = '1'; p.id = `err-${k}`; p.innerHTML = `${ICON.alert}${esc(msg)}`;
            (field || input.parentElement).appendChild(p); input.setAttribute('aria-describedby', p.id); first ||= input;
          }
        }
        const top = $('[data-form-error]'); top.innerHTML = `${ICON.alert}<span>${esc(res.message || 'Une erreur est survenue. Réessayez.')}</span>`; top.hidden = false;
        (first || top).scrollIntoView({ behavior: 'smooth', block: 'center' }); if (first?.focus) first.focus({ preventScroll: true });
        refreshQuote();
      } catch {
        const top = $('[data-form-error]'); top.textContent = 'Connexion perdue. Vérifiez votre réseau et réessayez.'; top.hidden = false;
      }
      btn.disabled = false; label.textContent = prev;
    });
  }

  // ——— Suivi de commande en direct ————————————————————————————————
  const track = $('[data-track]');
  if (track && 'EventSource' in window && !['delivered', 'cancelled'].includes(track.dataset.status)) {
    const es = new EventSource(`/api/suivi/${track.dataset.track}/events`);
    es.addEventListener('status', (ev) => { const { status } = JSON.parse(ev.data); if (status !== track.dataset.status) location.reload(); });
  }

  // ——— Espace pro : temps réel, cloche, notifications ———————————————
  const pro = $('[data-pro]');
  if (pro) {
    const role = pro.dataset.pro;
    const toasts = $('[data-toasts]');
    let audio;
    const chime = () => {
      try {
        audio ||= new (window.AudioContext || window.webkitAudioContext)();
        const t = audio.currentTime;
        [880, 1318.5].forEach((f, i) => { const o = audio.createOscillator(); const g = audio.createGain(); o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(0.0001, t + i * 0.14); g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.14 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 0.5); o.connect(g).connect(audio.destination); o.start(t + i * 0.14); o.stop(t + i * 0.14 + 0.55); });
      } catch { /* son indisponible */ }
    };
    const toast = (n) => {
      const a = document.createElement(n.link ? 'a' : 'div'); a.className = 'toast'; if (n.link) a.href = n.link;
      a.innerHTML = `<strong>${esc(n.title)}</strong>${n.body ? `<span>${esc(n.body)}</span>` : ''}`;
      toasts.appendChild(a); setTimeout(() => a.remove(), 9000);
    };
    document.addEventListener('click', () => { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }, { once: true });
    // ——— Alertes push (téléphone verrouillé) ———————————————————————
    const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const b64ToBytes = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
    let pushState = 'unknown';
    const swReady = pushSupported ? navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((reg) => { reg.update().catch(() => {}); return navigator.serviceWorker.ready; }).catch(() => null) : Promise.resolve(null);
    async function pushUi() {
      const banner = $('[data-push-banner]'); if (!banner) return;
      const text = $('[data-push-text]', banner); const btn = $('[data-push-enable]', banner);
      const show = (msg, withBtn = true) => { banner.hidden = false; text.textContent = msg; btn.hidden = !withBtn; };
      if (!pushSupported) {
        if (isIos && !standalone) return show('Sur iPhone : touchez Partager puis « Sur l’écran d’accueil », ouvrez l’app depuis l’icône et activez les alertes.', false);
        banner.hidden = true; return;
      }
      if (Notification.permission === 'denied') return show('Les notifications sont bloquées pour ce site : autorisez-les dans les réglages du navigateur.', false);
      const reg = await swReady; const sub = reg && await reg.pushManager.getSubscription();
      if (sub && Notification.permission === 'granted') { pushState = 'on'; banner.hidden = true; api('/api/push/subscribe', sub.toJSON()); return; }
      show('Activez les alertes sur ce téléphone pour être prévenu même écran verrouillé.');
    }
    document.addEventListener('click', async (e) => {
      if (!e.target.closest('[data-push-enable]')) return;
      const btn = e.target.closest('[data-push-enable]'); btn.disabled = true;
      try {
        if (await Notification.requestPermission() !== 'granted') { pushUi(); return; }
        const reg = await swReady; const { data } = await api('/api/push/key');
        const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(data.key) });
        const r = await api('/api/push/subscribe', sub.toJSON());
        if (r.ok) { toast({ title: 'Alertes activées', body: 'Vous serez prévenu même téléphone verrouillé.' }); api('/api/push/test', {}); }
      } catch (err) { toast({ title: 'Activation impossible', body: String(err.message || err) }); }
      btn.disabled = false; pushUi();
    });
    pushUi();

    const swapMain = debounce(async () => {
      if (document.activeElement && document.activeElement.matches('input, textarea, select')) return;
      const resp = await fetch(location.href, { credentials: 'same-origin' });
      // Page devenue inaccessible (course prise, annulée…) ou redirection : on recharge vraiment.
      if (!resp.ok || resp.redirected) { location.reload(); return; }
      const html = await resp.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const next = $('main', doc); const cur = $('main');
      if (next && cur) { const y = scrollY; cur.innerHTML = next.innerHTML; scrollTo(0, y); pushUi(); }
      const cnt = $('[data-pending-count]', doc); const curCnt = $('[data-pending-count]');
      if (curCnt && cnt) curCnt.textContent = cnt.textContent;
    }, 400);
    const liveList = () => (role === 'admin' ? /^\/admin(\/commandes)?\/?$/.test(location.pathname) : location.pathname === '/livreur');

    if ('EventSource' in window) {
      const es = new EventSource(role === 'admin' ? '/api/admin/events' : '/api/livreur/events');
      es.addEventListener('notification', (ev) => {
        const n = JSON.parse(ev.data);
        toast(n); chime();
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
        const dot = $('[data-bell-count]'); if (dot) { dot.hidden = false; dot.textContent = String((parseInt(dot.textContent, 10) || 0) + 1); }
        if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(n.title, { body: n.body, icon: '/img/favicon.svg' });
      });
      es.addEventListener('order', (ev) => {
        const o = JSON.parse(ev.data);
        if (liveList()) swapMain();
        else if (location.pathname.endsWith(`/${o.id}`) && !document.activeElement?.matches('input, textarea, select')) swapMain();
      });
    }
    const bell = $('[data-bell]'); const panel = $('[data-bell-panel]');
    if (bell) {
      bell.addEventListener('click', async (e) => {
        e.stopPropagation();
        const open = panel.hidden; panel.hidden = !open; bell.setAttribute('aria-expanded', String(open));
        if (!open) return;
        const { data } = await api('/api/notifications');
        $('[data-bell-list]').innerHTML = data.length ? data.map((n) => `<li class="${n.unread ? 'unread' : ''}"><a href="${esc(n.link || '#')}"><strong>${esc(n.title)}</strong><span class="muted">${esc(n.body)}</span></a></li>`).join('') : '<li><a>Aucune notification.</a></li>';
        api('/api/notifications/read', {}); const dot = $('[data-bell-count]'); if (dot) dot.hidden = true;
      });
      document.addEventListener('click', (e) => { if (!panel.hidden && !e.target.closest('.bell')) { panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); } });
    }
  }

  // Démarrage
  if (drawer) drawer.hidden = true;
  paintCounts(); paintAddControls();
  if (memory.length) refreshQuote(); else { renderDrawer(); renderSummary(); }
  addEventListener('storage', (e) => { if (e.key === KEY) { memory = cart.read(); onCartChange(); } });
})();
