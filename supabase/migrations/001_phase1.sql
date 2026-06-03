-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1 — Schema migration
-- Run this entire file in the Supabase SQL Editor before deploying the updated
-- app. It is fully idempotent (safe to run more than once).
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Material cost tracking + status on services ────────────────────────────

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS material_cost   NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS material_billed NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status          TEXT    NOT NULL DEFAULT 'open';

-- Existing services are historical records — mark them as completed.
UPDATE services
SET status = 'completed'
WHERE status = 'open';


-- ── 2. Fixed expense history ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fixed_expenses_history (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_id  UUID        NOT NULL REFERENCES fixed_expenses(id) ON DELETE CASCADE,
  amount      NUMERIC     NOT NULL,
  valid_from  DATE        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feh_expense_valid
  ON fixed_expenses_history (expense_id, valid_from DESC);

-- Seed: one record per existing expense, valid from its creation date.
INSERT INTO fixed_expenses_history (expense_id, amount, valid_from)
SELECT id, amount_monthly, created_at::date
FROM   fixed_expenses
ON CONFLICT DO NOTHING;


-- ── 3. Employee salary history ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employee_salary_history (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id    UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  monthly_salary NUMERIC     NOT NULL,
  monthly_hours  NUMERIC     NOT NULL,
  valid_from     DATE        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esh_employee_valid
  ON employee_salary_history (employee_id, valid_from DESC);

-- Seed: one record per existing employee, valid from their creation date.
INSERT INTO employee_salary_history (employee_id, monthly_salary, monthly_hours, valid_from)
SELECT id, monthly_salary, monthly_hours, created_at::date
FROM   employees
ON CONFLICT DO NOTHING;


-- ── 4. Hourly rate (settings) history ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settings_history (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hourly_rate NUMERIC     NOT NULL,
  valid_from  DATE        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sh_valid
  ON settings_history (valid_from DESC);

-- Seed: current rate, valid from the earliest reasonable date.
INSERT INTO settings_history (hourly_rate, valid_from)
SELECT hourly_rate, '2024-01-01'
FROM   settings
WHERE  id = 1
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- End of migration
-- ─────────────────────────────────────────────────────────────────────────────
