-- Maison Green — schéma de base de données
-- Montants en centimes (INTEGER). Dates en ISO 8601 UTC (TEXT).
-- Compatible PostgreSQL à quelques types près (voir README, section « Passer à PostgreSQL »).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin','driver')),
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  stripe_customer_id TEXT,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,            -- SHA-256 du jeton (le jeton brut n'est jamais stocké)
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Profil livreur (table « drivers »)
CREATE TABLE IF NOT EXISTS drivers (
  user_id      INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  vehicle      TEXT NOT NULL DEFAULT 'Vélo cargo',
  is_available INTEGER NOT NULL DEFAULT 1,
  notes        TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS addresses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT 'Domicile',
  line1       TEXT NOT NULL,
  line2       TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL,
  city        TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  is_default  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  tone        TEXT NOT NULL DEFAULT 'sage',   -- teinte de l'étiquette
  position    INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  description  TEXT NOT NULL DEFAULT '',
  origin       TEXT NOT NULL DEFAULT '',
  price_cents  INTEGER NOT NULL CHECK (price_cents >= 0),
  unit         TEXT NOT NULL DEFAULT 'pièce',   -- ex. « 1,5 L », « le kg », « 250 g »
  stock        INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  max_per_order INTEGER NOT NULL DEFAULT 20,
  image_url    TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,
  is_featured  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  deleted_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

CREATE TABLE IF NOT EXISTS delivery_zones (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  postal_codes    TEXT NOT NULL,              -- liste séparée par des virgules
  fee_cents       INTEGER NOT NULL DEFAULT 0,
  min_order_cents INTEGER NOT NULL DEFAULT 0,
  free_over_cents INTEGER,                     -- livraison offerte au-delà (optionnel)
  eta_minutes     INTEGER NOT NULL DEFAULT 45,
  position        INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1
);

-- Horaires d'ouverture de la boutique (0 = dimanche … 6 = samedi)
CREATE TABLE IF NOT EXISTS opening_hours (
  weekday    INTEGER PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6),
  is_open    INTEGER NOT NULL DEFAULT 1,
  opens_at   TEXT NOT NULL DEFAULT '09:00',
  closes_at  TEXT NOT NULL DEFAULT '20:00'
);

-- Créneaux de livraison récurrents
CREATE TABLE IF NOT EXISTS delivery_slots (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  weekday    INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at  TEXT NOT NULL,
  ends_at    TEXT NOT NULL,
  capacity   INTEGER NOT NULL DEFAULT 6,
  is_active  INTEGER NOT NULL DEFAULT 1
);

-- Jours sans livraison (fermeture exceptionnelle, jour férié…)
CREATE TABLE IF NOT EXISTS closures (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  date   TEXT NOT NULL UNIQUE,   -- AAAA-MM-JJ (heure de Paris)
  label  TEXT NOT NULL DEFAULT 'Fermeture exceptionnelle'
);

CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  number          TEXT NOT NULL UNIQUE,           -- MG-1024
  tracking_token  TEXT NOT NULL UNIQUE,           -- lien de suivi secret
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'received' CHECK (status IN
                   ('awaiting_payment','received','confirmed','preparing','ready','assigned','out_for_delivery','delivered','cancelled')),
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT NOT NULL,
  address_line1   TEXT NOT NULL,
  address_line2   TEXT NOT NULL DEFAULT '',
  postal_code     TEXT NOT NULL,
  city            TEXT NOT NULL,
  instructions    TEXT NOT NULL DEFAULT '',
  zone_id         INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL,
  zone_name       TEXT NOT NULL DEFAULT '',
  slot_date       TEXT NOT NULL,                   -- AAAA-MM-JJ
  slot_start      TEXT NOT NULL,                   -- HH:MM
  slot_end        TEXT NOT NULL,
  subtotal_cents  INTEGER NOT NULL,
  delivery_fee_cents INTEGER NOT NULL,
  total_cents     INTEGER NOT NULL,
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('card','cash')),
  payment_status  TEXT NOT NULL CHECK (payment_status IN
                   ('pending','paid','failed','due_on_delivery','refunded','partially_refunded','cancelled')),
  cash_to_collect_cents INTEGER NOT NULL DEFAULT 0,
  cash_collected_at TEXT,
  cash_remitted_at  TEXT,
  driver_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  picked_up_at    TEXT,
  delivered_at    TEXT,
  cancel_reason   TEXT,
  internal_note   TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_driver ON orders(driver_id);
CREATE INDEX IF NOT EXISTS idx_orders_slot ON orders(slot_date, slot_start);

CREATE TABLE IF NOT EXISTS order_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,                  -- figé au moment de la commande
  unit            TEXT NOT NULL DEFAULT '',
  unit_price_cents INTEGER NOT NULL,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  line_total_cents INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);

-- Historique des statuts (traçabilité)
CREATE TABLE IF NOT EXISTS order_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_events_order ON order_events(order_id);

CREATE TABLE IF NOT EXISTS payments (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id           INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider           TEXT NOT NULL CHECK (provider IN ('stripe','demo','cash')),
  status             TEXT NOT NULL,
  amount_cents       INTEGER NOT NULL,
  refunded_cents     INTEGER NOT NULL DEFAULT 0,
  checkout_session_id TEXT UNIQUE,
  payment_intent_id  TEXT,
  failure_message    TEXT,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- destinataire précis
  audience   TEXT,                                            -- ou tout un rôle : 'admin'
  kind       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  order_id   INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  link       TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notif_aud ON notifications(audience, read_at);

-- Stripe webhooks déjà traités (idempotence)
CREATE TABLE IF NOT EXISTS webhook_events (
  id          TEXT PRIMARY KEY,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Notifications push (téléphone verrouillé) : un abonnement par appareil.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  user_agent  TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_ok_at  TEXT,
  p256dh      TEXT NOT NULL DEFAULT '',
  auth        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

-- Mesure d'audience anonyme (sans cookie, sans adresse IP) : uniquement des totaux par jour.
-- dim : 'total' (key 'views' | 'visitors'), 'page', 'source', 'device'.
CREATE TABLE IF NOT EXISTS analytics_daily (
  day  TEXT NOT NULL,
  dim  TEXT NOT NULL,
  key  TEXT NOT NULL,
  n    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, dim, key)
);
