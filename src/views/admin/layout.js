import { html, raw } from '../../lib/html.js';
import { doc, logo, icon, flashBox } from '../ui.js';
import { unreadCount } from '../../services/notify.js';
import { one } from '../../db.js';

export function adminLayout(ctx, { title, active, body }) {
  const pending = one("SELECT COUNT(*) AS n FROM orders WHERE status = 'received'").n;
  const unread = unreadCount(ctx.user);
  const nav = [
    ['/admin', 'Tableau de bord', 'grid', 'dash'],
    ['/admin/commandes', 'Commandes', 'receipt', 'orders', pending],
    ['/admin/chiffre-affaires', "Chiffre d'affaires", 'cash', 'revenue'],
    ['/admin/statistiques', 'Statistiques', 'users', 'stats'],
    ['/admin/produits', 'Produits', 'box', 'products'],
    ['/admin/categories', 'Catégories', 'tag', 'categories'],
    ['/admin/zones', 'Zones de livraison', 'map', 'zones'],
    ['/admin/horaires', 'Horaires & créneaux', 'calendar', 'hours'],
    ['/admin/livreurs', 'Livreurs', 'users', 'drivers'],
  ];
  const bodyHtml = html`
<div class="pro-shell" data-pro="admin">
  <aside class="sidebar">
    <div class="sidebar-top">
      <div class="row" style="gap:10px">${logo('/admin')}<span class="pro-tag">Pro</span></div>
      <div class="row" style="gap:2px">
        <div class="bell">
          <button class="icon-btn" type="button" data-bell aria-label="Notifications" aria-expanded="false">${icon('bell')}${unread ? html`<span class="dot" data-bell-count>${unread > 9 ? '9+' : unread}</span>` : html`<span class="dot" data-bell-count hidden></span>`}</button>
          <div class="notif-panel" data-bell-panel hidden><div class="panel-head"><h2>Notifications</h2><form method="post" action="/admin/notifications/lues"><button class="btn btn-quiet btn-sm">Tout marquer lu</button></form></div><ul data-bell-list><li><a href="#">Chargement…</a></li></ul></div>
        </div>
        <form method="post" action="/deconnexion" class="hide-md"><button class="icon-btn" aria-label="Se déconnecter">${icon('logout')}</button></form>
      </div>
    </div>
    <nav class="side-nav" aria-label="Administration">
      ${nav.map(([href, label, ic, key, count]) => html`<a href="${href}" ${raw(active === key ? 'aria-current="page"' : '')}>${icon(ic)}<span>${label}</span>${count ? html`<span class="count" ${raw(key === 'orders' ? 'data-pending-count' : '')}>${count}</span>` : ''}</a>`)}
    </nav>
    <div class="side-foot">
      <a href="/" target="_blank">${icon('external')} Voir la boutique</a>
      <form method="post" action="/deconnexion"><button class="btn btn-quiet btn-sm" style="width:100%;justify-content:flex-start;color:var(--ink-3)">${icon('logout')} Déconnexion (${ctx.user.first_name})</button></form>
    </div>
  </aside>
  <main class="pro-main" id="contenu">${flashBox(ctx.flash)}<div class="notice notice-warn" data-push-banner hidden style="margin:0 0 16px;align-items:center;flex-wrap:wrap;gap:10px">${icon('bell')}<span data-push-text style="flex:1 1 220px">Activez les alertes sur ce téléphone pour être prévenu même écran verrouillé.</span><button class="btn btn-dark btn-sm" type="button" data-push-enable>Activer les alertes</button></div>${body}</main>
</div>
<div class="toast-stack" data-toasts aria-live="polite"></div>`;
  return doc({ title: `${title} · Admin`, body: bodyHtml, bodyClass: 'pro', robots: 'noindex', manifest: '/manifest-admin.webmanifest' });
}
