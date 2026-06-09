import type {
  Employee,
  TimeEntry,
} from "../types";
import { round2 } from "./format";

// ── Cost-per-hour maps ────────────────────────────────────────────────────────

/** Build a map of employeeId → cost/hour from current employee records. */
export function buildCostPerHourMap(employees: Employee[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of employees) {
    const mh = Number(e.monthly_hours) || 0;
    const ms = Number(e.monthly_salary) || 0;
    map.set(e.id, mh > 0 ? round2(ms / mh) : 0);
  }
  return map;
}

// ── Core aggregations ─────────────────────────────────────────────────────────

export function calcTotalHours(entries: Pick<TimeEntry, "hours">[]): number {
  return round2(entries.reduce((s, x) => s + (Number(x.hours) || 0), 0));
}

export function calcFaturado(totalHours: number, hourlyRate: number): number {
  return round2(totalHours * hourlyRate);
}

export function calcCusto(
  entries: Pick<TimeEntry, "hours" | "employee_id">[],
  costMap: Map<string, number>
): number {
  return round2(
    entries.reduce((s, x) => {
      const cph = costMap.get(x.employee_id) ?? 0;
      return s + (Number(x.hours) || 0) * cph;
    }, 0)
  );
}

// ── Profit calculations ───────────────────────────────────────────────────────

/** Contribution margin for labor only (no fixed expenses deducted). */
export function calcMargemMO(laborBilled: number, laborCost: number): number {
  return round2(laborBilled - laborCost);
}

/**
 * Full net profit for a service.
 *
 * Formula: laborBilled + materialBilled − laborCost − materialCost − fixedExpenses
 */
export function calcLucroLiquido(
  laborBilled: number,
  laborCost: number,
  fixedExpenses: number,
  materialBilled = 0,
  materialCost = 0
): number {
  return round2(
    laborBilled + materialBilled - laborCost - materialCost - fixedExpenses
  );
}
