import type {
  Employee,
  EmployeeSalaryHistory,
  FixedExpense,
  FixedExpenseHistory,
  Service,
  SettingsHistory,
  TimeEntry,
} from "../types";
import { ymFromDateISO } from "./dates";
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

/**
 * Build a cost-per-hour map using salary history valid at the start of a given
 * month (YYYY-MM). Falls back to the earliest known record if no record predates
 * the month, so historical months never return an empty map.
 */
export function buildCostPerHourMapForMonth(
  history: EmployeeSalaryHistory[],
  month: string
): Map<string, number> {
  if (history.length === 0) return new Map();
  const monthStart = `${month}-01`;

  const byEmployee = new Map<string, EmployeeSalaryHistory[]>();
  for (const h of history) {
    const arr = byEmployee.get(h.employee_id) ?? [];
    arr.push(h);
    byEmployee.set(h.employee_id, arr);
  }

  const map = new Map<string, number>();
  for (const [empId, records] of byEmployee) {
    const sorted = [...records].sort((a, b) =>
      b.valid_from.localeCompare(a.valid_from)
    );
    const record =
      sorted.find((r) => r.valid_from <= monthStart) ??
      sorted[sorted.length - 1];
    if (record) {
      const mh = Number(record.monthly_hours) || 0;
      const ms = Number(record.monthly_salary) || 0;
      map.set(empId, mh > 0 ? round2(ms / mh) : 0);
    }
  }

  return map;
}

// ── Rate lookups ─────────────────────────────────────────────────────────────

/**
 * Return the hourly rate valid at the start of a given month.
 * Falls back to `fallback` when history is empty, and to the earliest known
 * rate when the month predates all history records.
 */
export function getHourlyRateForMonth(
  history: SettingsHistory[],
  month: string,
  fallback: number
): number {
  if (history.length === 0) return fallback;
  const monthStart = `${month}-01`;
  const sorted = [...history].sort((a, b) =>
    b.valid_from.localeCompare(a.valid_from)
  );
  const valid = sorted.find((r) => r.valid_from <= monthStart);
  return valid?.hourly_rate ?? sorted[sorted.length - 1].hourly_rate;
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

export function calcFixedExpensesTotal(
  fixedExpenses: Pick<FixedExpense, "amount_monthly">[]
): number {
  return round2(
    fixedExpenses.reduce((s, x) => s + (Number(x.amount_monthly) || 0), 0)
  );
}

/**
 * Sum fixed expenses valid at the start of the given month using history
 * records. Expenses with no record valid before the month are excluded
 * (they did not exist yet). Expenses that have been deleted still contribute
 * via their last valid record.
 */
export function calcFixedExpensesForMonth(
  history: FixedExpenseHistory[],
  month: string
): number {
  if (history.length === 0) return 0;
  const monthStart = `${month}-01`;

  const byExpense = new Map<string, FixedExpenseHistory[]>();
  for (const h of history) {
    const arr = byExpense.get(h.expense_id) ?? [];
    arr.push(h);
    byExpense.set(h.expense_id, arr);
  }

  let total = 0;
  for (const [, records] of byExpense) {
    const sorted = [...records].sort((a, b) =>
      b.valid_from.localeCompare(a.valid_from)
    );
    const valid = sorted.find((r) => r.valid_from <= monthStart);
    if (valid) total += valid.amount;
  }

  return round2(total);
}

// ── Profit calculations ───────────────────────────────────────────────────────

/** Contribution margin for labor only (no fixed expenses deducted). */
export function calcMargemMO(laborBilled: number, laborCost: number): number {
  return round2(laborBilled - laborCost);
}

/**
 * Full net profit. Material params default to 0 so existing callers remain
 * valid without changes.
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

// ── Break-even ────────────────────────────────────────────────────────────────

/** Unweighted average cost per hour across all employees. */
export function calcAvgCostPerHour(costMap: Map<string, number>): number {
  if (costMap.size === 0) return 0;
  const sum = Array.from(costMap.values()).reduce((s, v) => s + v, 0);
  return round2(sum / costMap.size);
}

/**
 * Labor hours required this period to cover fixed expenses.
 * Returns Infinity when the contribution margin per hour is zero or negative
 * (the workshop loses money on every hour billed).
 */
export function calcBreakEvenHours(
  fixedExpenses: number,
  hourlyRate: number,
  avgCostPerHour: number
): number {
  const contribution = round2(hourlyRate - avgCostPerHour);
  if (contribution <= 0) return Infinity;
  return round2(fixedExpenses / contribution);
}

// ── Filters ──────────────────────────────────────────────────────────────────

export function filterServiceIdsByMonth(
  services: Pick<Service, "id" | "service_date">[],
  month: string
): Set<string> {
  return new Set(
    services
      .filter((s) => ymFromDateISO(String(s.service_date)) === month)
      .map((s) => s.id)
  );
}

export function filterEntriesByServiceIds(
  entries: TimeEntry[],
  serviceIds: Set<string>
): TimeEntry[] {
  return entries.filter((te) => serviceIds.has(te.service_id));
}
