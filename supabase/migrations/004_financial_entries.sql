-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 004 — Financial entries (quick daily/weekly totals)
--
-- Replaces the category-based financial_movements as the primary revenue/
-- expense input. Each row records two numbers for a day or a week:
--   - revenue  (total income for the period)
--   - expenses (total variable expenses for the period)
--
-- De-duplication rule enforced by the analytics engine (not the DB):
--   If a week entry exists for a given ISO week, day entries inside that week
--   are excluded from aggregations.
--
-- The old financial_movements table is preserved (not dropped) for backward
-- compatibility but is no longer used in primary analytics.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS financial_entries (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_type  TEXT        NOT NULL CHECK (period_type IN ('day', 'week')),
  date         DATE        NOT NULL,   -- for day: the exact date
                                       -- for week: the Monday (ISO week start)
  revenue      NUMERIC     NOT NULL DEFAULT 0,
  expenses     NUMERIC     NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finent_date   ON financial_entries (date DESC);
CREATE INDEX IF NOT EXISTS idx_finent_period ON financial_entries (period_type);

ALTER TABLE financial_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access" ON financial_entries
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
