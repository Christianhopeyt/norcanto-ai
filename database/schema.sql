-- QuickDocs Database Schema for Supabase
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── USERS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  avatar_url    TEXT,
  timezone      TEXT DEFAULT 'UTC',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ─── SUBSCRIPTION PLANS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id                         TEXT PRIMARY KEY,
  name                       TEXT NOT NULL,
  price_monthly_cents        INT NOT NULL DEFAULT 0,
  price_annual_cents         INT NOT NULL DEFAULT 0,
  docs_per_month             INT NOT NULL DEFAULT 5,
  pages_per_doc              INT NOT NULL DEFAULT 20,
  ai_requests_per_month      INT NOT NULL DEFAULT 20,
  storage_mb                 INT NOT NULL DEFAULT 50,
  chat_messages_per_doc      INT NOT NULL DEFAULT 10,
  has_risk_detection         BOOLEAN NOT NULL DEFAULT FALSE,
  has_action_items           BOOLEAN NOT NULL DEFAULT FALSE,
  has_export                 BOOLEAN NOT NULL DEFAULT FALSE,
  has_priority               BOOLEAN NOT NULL DEFAULT FALSE,
  has_multi_doc              BOOLEAN NOT NULL DEFAULT FALSE,
  has_advanced_chat          BOOLEAN NOT NULL DEFAULT FALSE,
  is_active                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed plans
INSERT INTO subscription_plans VALUES
  ('free',    'Free',    0,    0,    5,   20,  20,   50,   10, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, NOW()),
  ('trial',   'Trial',   0,    0,    20,  100, 100,  200,  30, TRUE,  TRUE,  TRUE,  FALSE, FALSE, FALSE, TRUE, NOW()),
  ('premium', 'Premium', 999,  9990, 100, 200, 500,  1024, 100, TRUE, TRUE,  TRUE,  TRUE,  FALSE, FALSE, TRUE, NOW()),
  ('pro',     'Pro',     1999, 19990,-1,  1000,-1,   10240,-1, TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE, NOW())
ON CONFLICT (id) DO UPDATE SET
  price_monthly_cents = EXCLUDED.price_monthly_cents,
  updated_at = NOW();

-- ─── SUBSCRIPTIONS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id               TEXT NOT NULL REFERENCES subscription_plans(id),
  status                TEXT NOT NULL DEFAULT 'trialing'
                          CHECK (status IN ('trialing','active','past_due','cancelled','expired','paused')),
  billing_cycle         TEXT DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','annual')),
  trial_start           TIMESTAMPTZ,
  trial_end             TIMESTAMPTZ,
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  last_payment_id       UUID,
  camerpay_customer_id  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- ─── PAYMENTS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reference                TEXT UNIQUE NOT NULL,
  plan_id                  TEXT NOT NULL,
  billing_cycle            TEXT DEFAULT 'monthly',
  amount                   INT NOT NULL,
  currency                 TEXT NOT NULL DEFAULT 'XAF',
  status                   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','initiated','succeeded','failed','refunded','cancelled')),
  provider                 TEXT NOT NULL DEFAULT 'camerpay',
  phone                    TEXT,
  provider_transaction_id  TEXT,
  failure_reason           TEXT,
  completed_at             TIMESTAMPTZ,
  refunded_at              TIMESTAMPTZ,
  metadata                 JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- ─── PAYMENT EVENTS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider        TEXT NOT NULL DEFAULT 'camerpay',
  event_type      TEXT NOT NULL,
  reference       TEXT,
  transaction_id  TEXT,
  payload         JSONB,
  processed       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_events_reference ON payment_events(reference);

-- ─── USAGE TRACKING ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_tracking (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start      TIMESTAMPTZ NOT NULL,
  period_end        TIMESTAMPTZ NOT NULL,
  docs_uploaded     INT NOT NULL DEFAULT 0,
  ai_requests       INT NOT NULL DEFAULT 0,
  pages_processed   INT NOT NULL DEFAULT 0,
  storage_bytes     BIGINT NOT NULL DEFAULT 0,
  chat_messages     INT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_user_id ON usage_tracking(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_user_period ON usage_tracking(user_id, period_start);

-- ─── DOCUMENT ANALYSES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_analyses (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name         TEXT NOT NULL,
  file_type         TEXT,
  file_size_bytes   INT,
  pages_analyzed    INT DEFAULT 0,
  plan_at_analysis  TEXT,
  analysis          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doc_analyses_user_id ON document_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_doc_analyses_created ON document_analyses(created_at DESC);

-- ─── TRIAL PERIODS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trial_periods (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  ip_hash        TEXT,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at       TIMESTAMPTZ,
  converted      BOOLEAN DEFAULT FALSE,
  converted_plan TEXT
);
-- Prevent trial abuse by IP
CREATE INDEX IF NOT EXISTS idx_trial_ip_hash ON trial_periods(ip_hash);
CREATE INDEX IF NOT EXISTS idx_trial_email ON trial_periods(email);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_analyses ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (our serverless functions use service key)
-- These policies are for client-side Supabase calls (not used in our setup)

-- ─── UPDATED_AT TRIGGER ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_users BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_subs BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_payments BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at_usage BEFORE UPDATE ON usage_tracking FOR EACH ROW EXECUTE FUNCTION update_updated_at();
