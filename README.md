# Maison Green — commande et livraison en ligne

Application complète pour l'épicerie Maison Green (Rouen) : boutique en ligne, paiement par carte ou en espèces, suivi de commande en direct, back-office et application livreur.

## Démarrer en 2 minutes (Mac)

1. Installez **Node.js 22.13 ou plus récent** si ce n'est pas déjà fait : <https://nodejs.org> (version « LTS »).
   Vérification : `node -v` dans le Terminal.
2. Dans le Terminal :
   ```bash
   cd ~/Documents/maison-green
   npm start
   ```
3. Ouvrez <http://localhost:3000>

Aucun `npm install` n'est nécessaire : l'application n'utilise **aucune dépendance externe** (uniquement les modules intégrés à Node : serveur HTTP, base SQLite, chiffrement). Au premier lancement, une base de démonstration est créée automatiquement.

| Espace | Adresse | Identifiant | Mot de passe |
|---|---|---|---|
| Boutique | `/` | — (commande sans compte possible) | — |
| Client de démo | `/connexion` | thomas.martin@exemple.fr | Client-2026 |
| Administration | `/admin` | admin@maisongreen.fr | MaisonGreen-2026 |
| Livreur (Lucas) | `/livreur` | lucas@maisongreen.fr | Livreur-2026 |
| Livreuse (Inès) | `/livreur` | ines@maisongreen.fr | Livreur-2026 |

> Pour voir le temps réel : ouvrez l'admin dans une fenêtre, la boutique dans une autre, passez une commande → l'admin reçoit une notification sonore instantanément. Le suivi client se met à jour tout seul quand l'admin ou le livreur change le statut.

Autres commandes :

```bash
npm run dev     # redémarre automatiquement à chaque modification du code
npm run reset   # efface la base et recrée les données de démonstration
npm test        # 9 tests de bout en bout (parcours complet, paiements, sécurité, RGPD…)
```

Pour tester sur votre téléphone : même Wi-Fi que le Mac, puis `http://<adresse-IP-du-Mac>:3000`.

---

## Architecture

```
Navigateur (client / admin / livreur)
        │  HTML rendu côté serveur + JavaScript léger (public/js/app.js)
        │  Temps réel : Server-Sent Events
        ▼
server.js ── sécurité (en-têtes, CSRF, sessions) ── routeur
        │
        ├── src/routes/     shop · account · admin · driver
        ├── src/services/   catalog · delivery · orders · payments · notify   ← toute la logique métier
        ├── src/views/      gabarits HTML (échappement automatique)
        └── src/db.js       SQLite (node:sqlite) — seul point d'accès aux données
                │
                ├── Stripe (API REST, Checkout hébergé + webhooks signés)
                └── Resend (e-mails transactionnels)
```

Principe : **le serveur est la seule source de vérité**. Prix, frais de livraison, minimum, stock, zone et créneau sont recalculés et vérifiés à chaque commande ; les transitions de statut sont contrôlées ; chaque route vérifie le rôle.

### Base de données (`src/schema.sql`)

`users` (rôles client / admin / livreur) · `sessions` · `drivers` · `addresses` · `categories` · `products` · `delivery_zones` · `opening_hours` · `delivery_slots` · `closures` · `orders` · `order_items` (nom et prix figés) · `order_events` (historique) · `payments` · `notifications` · `webhook_events` · `settings`.
Montants en centimes, dates en UTC ISO, heure de Paris gérée dans `src/lib/time.js`.

### Statuts d'une commande

`awaiting_payment` (carte non encore payée, invisible des listes « en cours ») → `received` → `confirmed` → `preparing` → `ready` → `assigned` → `out_for_delivery` → `delivered`, ou `cancelled` (stock remis en rayon, remboursement automatique si payé par carte). Une commande carte non payée est annulée automatiquement après 45 min.

---

## Mettre en production

### 1. Variables d'environnement

Copiez `.env.example` en `.env` et remplissez :

| Variable | Rôle |
|---|---|
| `NODE_ENV=production` | active les cookies `Secure` et HSTS |
| `BASE_URL` | ex. `https://maisongreen.fr` (liens des e-mails, retours Stripe) |
| `SESSION_SECRET` | 32 caractères aléatoires minimum (`openssl rand -hex 32`) |
| `STRIPE_SECRET_KEY` | clé secrète Stripe (`sk_live_…` ou `sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | secret du webhook (`whsec_…`) |
| `RESEND_API_KEY`, `EMAIL_FROM` | envoi des e-mails (sinon affichés dans la console) |
| `ADMIN_PASSWORD` | mot de passe du compte admin créé au premier lancement |

### Importer le vrai catalogue

Admin → Produits → **Importer / exporter** (`/admin/produits/import`) : envoyez un tableau enregistré en CSV (colonnes `nom ; rayon ; prix ; format ; stock ; origine ; description ; vedette ; en_ligne ; max_par_commande`, seuls les trois premiers sont obligatoires). Un aperçu s'affiche avant toute modification. Le mode « Remplacer tout le catalogue » retire les produits d'exemple (les rayons vides sont simplement masqués) ; le mode « Ajouter et mettre à jour » reconnaît les produits existants par leur nom et garde leurs photos. Le catalogue actuel s'exporte dans le même format pour être modifié dans Excel puis réimporté.

### Alertes sur téléphone (livreurs et boutique)

Un bandeau « Activer les alertes » s'affiche dans l'espace livreur et dans l'admin. Une fois activées, l'appareil reçoit une notification push même écran verrouillé : la boutique à chaque nouvelle commande, les livreurs **disponibles** dès qu'une commande est confirmée (elle apparaît alors dans « Nouvelles »). Android : fonctionne directement dans Chrome. iPhone (iOS 16.4+) : ouvrir la page dans Safari → Partager → « Sur l'écran d'accueil », puis ouvrir l'app depuis l'icône et activer les alertes. Les clés VAPID sont générées automatiquement et conservées dans la base.

### Sauvegardes

Admin → Horaires → « Sauvegarde des données » télécharge une copie complète de la base (fichier `.db`). À faire au moins une fois par mois (le tableau de bord le rappelle). Pour restaurer : remplacer `data/maison-green.db` sur le volume par ce fichier, puis redémarrer le service.

**Changez tous les mots de passe de démonstration** et lancez `npm run reset` (ou supprimez `data/`) avant l'ouverture, pour partir d'une base vierge sans les commandes fictives. Ajoutez vos vrais produits depuis l'admin.

### 2. Stripe

1. Créez un compte sur <https://dashboard.stripe.com>, récupérez la clé secrète (Développeurs → Clés API).
2. Développeurs → Webhooks → Ajouter un endpoint : `https://votre-domaine/api/stripe/webhook`
   Événements : `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `payment_intent.payment_failed`, `charge.refunded`.
3. Collez le secret de signature dans `STRIPE_WEBHOOK_SECRET`.
4. Test en local : `stripe listen --forward-to localhost:3000/api/stripe/webhook` (Stripe CLI), carte de test `4242 4242 4242 4242`.

Sans clé Stripe, un **mode démo** clairement signalé permet de simuler un paiement réussi ou refusé.

### 3. Hébergement

L'application est un seul processus Node avec un fichier de base SQLite : il faut un hébergeur avec **disque persistant**.

- **Railway / Render / Fly.io** : déployez le dossier (Dockerfile fourni), montez un volume sur `/app/data` et `/app/public/uploads`.
- **VPS (OVHcloud, Scaleway, Hetzner…)** : `npm start` derrière Caddy ou Nginx (HTTPS), avec `pm2` ou systemd pour le redémarrage.

Sauvegarde : copiez régulièrement `data/maison-green.db` (par exemple chaque nuit vers un stockage externe).

### 4. Évolutions prévues par l'architecture

- **PostgreSQL / Supabase** : toute la persistance passe par `one / all / run / tx` dans `src/db.js`. Remplacer ces 4 fonctions par un client Postgres (et `?` → `$1`, `AUTOINCREMENT` → `GENERATED ALWAYS AS IDENTITY`) suffit ; le schéma est standard.
- **Photos** : stockées dans `public/uploads/`. Pour plusieurs serveurs, basculer `saveImage()` (`src/routes/admin.js`) vers S3 / Supabase Storage.
- **Temps réel multi-serveurs** : `src/lib/events.js` → Redis pub/sub ou Supabase Realtime.
- **Notifications push mobiles** (téléphone verrouillé) : ajouter Web Push (VAPID) ou SMS (Twilio / Brevo) dans `src/services/notify.js`. Aujourd'hui : notifications dans l'application en direct (son, vibration, notification système quand l'onglet est ouvert) + e-mails.
- **Application mobile livreur** : l'interface `/livreur` est installable sur l'écran d'accueil (manifeste PWA).

---

## Sécurité et RGPD

- Mots de passe hachés avec **scrypt** + sel ; comparaison en temps constant ; limitation des tentatives de connexion.
- Sessions serveur révocables (jeton aléatoire, seul son empreinte SHA-256 est stockée), cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production.
- Contrôle d'accès par rôle sur chaque route ; un livreur ne voit que ses courses et celles en attente de livreur.
- Protection CSRF (vérification de l'origine de chaque requête qui modifie des données).
- En-têtes de sécurité : CSP stricte, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, HSTS.
- Validation serveur de toutes les entrées (`src/lib/validate.js`), échappement HTML automatique dans tous les gabarits.
- Photos : format vérifié par signature binaire, nom de fichier aléatoire, 5 Mo maximum.
- **Aucune donnée bancaire** ne transite par le serveur (Stripe Checkout hébergé) ; les cartes enregistrées restent chez Stripe.
- Webhooks Stripe signés et idempotents.
- RGPD : export des données (JSON) et suppression du compte depuis l'espace client, anonymisation des commandes conservées pour la comptabilité, un seul cookie strictement nécessaire (pas de bandeau requis), pages Confidentialité / CGV / Mentions légales (modèles à compléter : SIRET, hébergeur, médiateur).

---

## Arborescence

```
server.js                 point d'entrée
src/config.js             configuration (.env)
src/db.js, schema.sql     base de données
src/auth.js               mots de passe, sessions, rôles
src/seed.js               données de démonstration
src/lib/                  http, validation, dates (Paris), HTML sûr, temps réel
src/services/             logique métier
src/routes/               pages et API
src/views/                gabarits (boutique, admin, livreur)
public/css/app.css        système visuel complet
public/js/app.js          interactions (panier, commande, temps réel)
public/fonts/             Lora (hébergée localement, pas d'appel à Google)
test/app.test.js          tests de bout en bout
```
