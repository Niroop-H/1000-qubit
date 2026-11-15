-- D25 license backend. Customer circuits and passwords NEVER enter this DB.
CREATE TABLE IF NOT EXISTS d25_accounts (
 uid TEXT PRIMARY KEY NOT NULL,
 email TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'not_subscribed',
 subscription_id TEXT UNIQUE,
 checkout_url TEXT,
 paid_until_ms INTEGER NOT NULL DEFAULT 0,
 last_payment_id TEXT,
 last_payment_at_ms INTEGER,
 created_at_ms INTEGER NOT NULL,
 updated_at_ms INTEGER NOT NULL,
 lease_token TEXT,
 lease_until_ms INTEGER NOT NULL DEFAULT 0,
 requires_review INTEGER NOT NULL DEFAULT 0,
 recovery_subscription_id TEXT,
 cancellation_requested_at_ms INTEGER,
 refunded INTEGER NOT NULL DEFAULT 0,
 revoked INTEGER NOT NULL DEFAULT 0,
 disabled INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_d25_accounts_paid ON d25_accounts(paid_until_ms);
CREATE INDEX IF NOT EXISTS idx_d25_accounts_created ON d25_accounts(created_at_ms);
CREATE TABLE IF NOT EXISTS d25_subscriptions (
 subscription_id TEXT PRIMARY KEY NOT NULL,
 uid TEXT NOT NULL,
 plan_id TEXT NOT NULL,
 created_at_ms INTEGER NOT NULL,
 FOREIGN KEY(uid) REFERENCES d25_accounts(uid)
);
CREATE INDEX IF NOT EXISTS idx_d25_subscriptions_uid ON d25_subscriptions(uid);
CREATE TABLE IF NOT EXISTS d25_charges (
 payment_id TEXT PRIMARY KEY NOT NULL,
 uid TEXT NOT NULL,
 subscription_id TEXT NOT NULL,
 amount_paise INTEGER NOT NULL,
 currency TEXT NOT NULL,
 paid_until_ms INTEGER NOT NULL,
 received_at_ms INTEGER NOT NULL,
 refunded_at_ms INTEGER,
 FOREIGN KEY(uid) REFERENCES d25_accounts(uid)
);
CREATE INDEX IF NOT EXISTS idx_d25_charges_date ON d25_charges(received_at_ms);
CREATE TABLE IF NOT EXISTS d25_webhook_events (
 event_id TEXT PRIMARY KEY NOT NULL,
 event_type TEXT NOT NULL,
 processed_at_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS d25_quotas (
 uid TEXT PRIMARY KEY NOT NULL,
 used INTEGER NOT NULL DEFAULT 0 CHECK(used BETWEEN 0 AND 20),
 reset_at_ms INTEGER NOT NULL DEFAULT 0,
 updated_at_ms INTEGER NOT NULL,
 last_request_id TEXT
);
CREATE TABLE IF NOT EXISTS d25_reservations (
 request_id TEXT PRIMARY KEY NOT NULL,
 uid TEXT NOT NULL,
 created_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_d25_reservations_uid ON d25_reservations(uid,created_at_ms);
CREATE TABLE IF NOT EXISTS d25_admin_audit (
 event_id TEXT PRIMARY KEY NOT NULL,
 actor_uid TEXT NOT NULL,
 target_uid TEXT NOT NULL,
 action TEXT NOT NULL,
 created_at_ms INTEGER NOT NULL,
 result TEXT NOT NULL
);
