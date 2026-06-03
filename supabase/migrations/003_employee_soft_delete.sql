-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003 — Employee soft-delete
--
-- Instead of hard-deleting employees (which fails when time_entries or
-- salary_history rows reference them), we set active = false.
-- Inactive employees are hidden from the UI but preserved in the database
-- so historical salary proration in reports remains correct.
--
-- Run after 001_phase1.sql and 002_phase2.sql. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

-- All existing employees are active by default.
UPDATE employees SET active = TRUE WHERE active IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
