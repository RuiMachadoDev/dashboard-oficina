import { supabase } from "./supabase";

export type MigrationCheck = {
  id: "001" | "002" | "003";
  file: string;
  label: string;
  ok: boolean;
};

/**
 * Probes the database for the tables and columns added by each migration.
 * Returns one entry per migration, with ok=false if it hasn't been applied.
 */
export async function checkMigrations(): Promise<MigrationCheck[]> {
  const [m001, m002, m003] = await Promise.all([
    // 001: fixed_expenses_history table must exist
    supabase.from("fixed_expenses_history").select("id").limit(1),
    // 002: financial_movements table must exist
    supabase.from("financial_movements").select("id").limit(1),
    // 003: employees.active column must exist
    supabase.from("employees").select("active").limit(1),
  ]);

  return [
    {
      id: "001",
      file: "001_phase1.sql",
      label: "Histórico de custos e colunas de materiais em serviços",
      ok: !m001.error,
    },
    {
      id: "002",
      file: "002_phase2.sql",
      label: "Tabela de movimentos financeiros",
      ok: !m002.error,
    },
    {
      id: "003",
      file: "003_employee_soft_delete.sql",
      label: "Soft-delete de funcionários (coluna active)",
      ok: !m003.error,
    },
  ];
}

/**
 * Helper used in data-loading hooks. Tries a query with .eq("active", true);
 * if the column doesn't exist yet (migration 003 pending), falls back to
 * loading all employees without that filter.
 */
export async function loadActiveEmployees<
  T extends { id: string; monthly_salary: number }
>(selectFields: string): Promise<T[]> {
  const filtered = await supabase
    .from("employees")
    .select(selectFields)
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (!filtered.error) return (filtered.data ?? []) as unknown as T[];

  // Fall back if the active column doesn't exist yet
  const all = await supabase
    .from("employees")
    .select(selectFields)
    .order("created_at", { ascending: true });

  return (all.data ?? []) as unknown as T[];
}
