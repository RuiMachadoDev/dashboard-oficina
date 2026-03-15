import type { Employee, FixedExpense, Service, TimeEntry } from "../types";
import { ymFromDateISO } from "./dates";

export function buildCostPerHourMap(employees: Employee[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of employees) {
    const mh = Number(e.monthly_hours) || 0;
    const ms = Number(e.monthly_salary) || 0;
    map.set(e.id, mh > 0 ? ms / mh : 0);
  }
  return map;
}

export function calcTotalHours(entries: Pick<TimeEntry, "hours">[]): number {
  return entries.reduce((s, x) => s + (Number(x.hours) || 0), 0);
}

export function calcFaturado(totalHours: number, hourlyRate: number): number {
  return totalHours * hourlyRate;
}

export function calcCusto(
  entries: Pick<TimeEntry, "hours" | "employee_id">[],
  costMap: Map<string, number>
): number {
  return entries.reduce((s, x) => {
    const cph = costMap.get(x.employee_id) ?? 0;
    return s + (Number(x.hours) || 0) * cph;
  }, 0);
}

export function calcFixedExpensesTotal(
  fixedExpenses: Pick<FixedExpense, "amount_monthly">[]
): number {
  return fixedExpenses.reduce((s, x) => s + (Number(x.amount_monthly) || 0), 0);
}

export function calcLucroLiquido(
  faturado: number,
  custo: number,
  despesasFixas: number
): number {
  return faturado - custo - despesasFixas;
}

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
