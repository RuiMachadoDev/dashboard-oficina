-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Financial movements + direct labor billing
-- Run this in the Supabase SQL Editor. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Direct labor billing on services ──────────────────────────────────────
-- When set, this amount is used directly as labor revenue instead of
-- computing from time_entries × hourly_rate. Null = use time entries.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS labor_billed NUMERIC DEFAULT NULL;


-- ── 2. Financial movements ledger ────────────────────────────────────────────
-- Records all cash in/out that is not captured by services:
-- actual salary payments, rent, utilities, tools, taxes, etc.

CREATE TABLE IF NOT EXISTS financial_movements (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  date        DATE        NOT NULL,
  type        TEXT        NOT NULL CHECK (type IN ('income', 'expense')),
  category    TEXT        NOT NULL,
  description TEXT,
  amount      NUMERIC     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fm_date ON financial_movements (date DESC);
CREATE INDEX IF NOT EXISTS idx_fm_type ON financial_movements (type);


-- ─────────────────────────────────────────────────────────────────────────────
-- End of migration
-- ─────────────────────────────────────────────────────────────────────────────
