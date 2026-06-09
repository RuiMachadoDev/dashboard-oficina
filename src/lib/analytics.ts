/**
 * Central financial analytics engine — financial_entries model.
 *
 * Revenue:
 *   financial_entries.revenue  (day or week entries)
 *
 * Variable expenses:
 *   financial_entries.expenses (day or week entries)
 *
 * Structural costs (prorated by calendar days):
 *   1. Employee salaries  → totalMonthlySalary / daysInMonth per day
 *   2. Fixed expenses     → totalMonthlyFixed  / daysInMonth per day
 *
 * Net result:
 *   revenue − variable_expenses − structural_costs
 *
 * Double-counting rule:
 *   If a week entry exists for ISO week W, all day entries whose date falls
 *   inside W are ignored for that week. The week entry always wins.
 *   If no week entry for ISO week W, individual day entries are summed.
 *
 * Partial-week proration:
 *   When a week entry's ISO week partially overlaps the query period (e.g., a
 *   month boundary), the entry's amounts are prorated:
 *     assigned = total × (days_of_week_in_period / 7)
 */

import type {
  Employee,
  FinancialEntry,
  FixedExpense,
  FixedExpenseHistory,
  Service,
  TimeEntry,
} from "../types";
import { daysInMonth, getISOWeek } from "./dates";
import { round2 } from "./format";

// ── Legacy helpers (used by ServicosPage / ServicoDetalhePage) ────────────────

/**
 * Historical fixed expenses: returns amounts valid at the start of `month`.
 * Used by RelatoriosPage for historically-accurate 6-month trend calculations.
 */
export function buildHistoricalFixedExpenses(
  history: FixedExpenseHistory[],
  month: string
): { amount_monthly: number }[] {
  if (history.length === 0) return [];
  const monthStart = `${month}-01`;

  const byExpense = new Map<string, FixedExpenseHistory[]>();
  for (const h of history) {
    const arr = byExpense.get(h.expense_id) ?? [];
    arr.push(h);
    byExpense.set(h.expense_id, arr);
  }

  const result: { amount_monthly: number }[] = [];
  for (const [, records] of byExpense) {
    const sorted = [...records].sort((a, b) =>
      b.valid_from.localeCompare(a.valid_from)
    );
    const valid = sorted.find((r) => r.valid_from <= monthStart);
    if (valid) result.push({ amount_monthly: valid.amount });
  }
  return result;
}

/** Legacy helper — resolves labor revenue for a single service. */
export function resolveServiceLaborBilled(
  service: Service,
  entries: TimeEntry[],
  hourlyRate: number
): number {
  if (service.labor_billed !== null && service.labor_billed !== undefined) {
    return round2(Number(service.labor_billed) || 0);
  }
  const hours = entries.reduce((s, te) => s + (Number(te.hours) || 0), 0);
  return round2(hours * hourlyRate);
}

/** Build a Map<serviceId → TimeEntry[]>. Used by legacy ServicosPage. */
export function buildTimeEntriesMap(
  allEntries: TimeEntry[],
  serviceIds: string[]
): Map<string, TimeEntry[]> {
  const ids = new Set(serviceIds);
  const map = new Map<string, TimeEntry[]>();
  for (const te of allEntries) {
    if (!ids.has(te.service_id)) continue;
    const arr = map.get(te.service_id) ?? [];
    arr.push(te);
    map.set(te.service_id, arr);
  }
  return map;
}

// ── Output types ──────────────────────────────────────────────────────────────

export type DayData = {
  date: string;
  label: string;
  revenue: number;
  expenses: number;
  profit: number;
};

export type CategoryAmount = {
  category: string;
  amount: number;
  pct: number;
};

export type PeriodAnalytics = {
  totalRevenue: number;
  entryRevenue: number;

  totalExpenses: number;
  totalCosts: number;       // alias for totalExpenses — variableExpenses + salaryCost + fixedCost
  salaryCost: number;
  fixedCost: number;
  variableExpenses: number;

  expenseBreakdown: CategoryAmount[];
  revenueBreakdown: CategoryAmount[];

  netProfit: number;
  profitMargin: number;
  isProfitable: boolean;

  byDay: DayData[];
  insights: string[];
};

// ── Internal helpers ──────────────────────────────────────────────────────────

function toBreakdown(map: Map<string, number>, total: number): CategoryAmount[] {
  const arr: CategoryAmount[] = [];
  for (const [category, amount] of map) {
    arr.push({
      category,
      amount: round2(amount),
      pct: total > 0 ? round2((amount / total) * 100) : 0,
    });
  }
  return arr.sort((a, b) => b.amount - a.amount);
}

function fmtEuro(n: number) {
  return `€ ${n.toFixed(2).replace(".", ",")}`;
}

/**
 * Resolves financial_entries for the given dates, applying the double-counting
 * rule (week entries win over day entries for the same ISO week).
 */
function resolveEntries(
  dates: string[],
  entries: FinancialEntry[]
): {
  totalRevenue: number;
  totalVariableExpenses: number;
  byDate: Map<string, { revenue: number; expenses: number }>;
} {
  const byDate = new Map<string, { revenue: number; expenses: number }>();
  for (const d of dates) byDate.set(d, { revenue: 0, expenses: 0 });

  // Group period dates by ISO week key
  const datesByWeekKey = new Map<string, string[]>();
  for (const d of dates) {
    const { year, week } = getISOWeek(d);
    const key = `${year}-W${String(week).padStart(2, "0")}`;
    if (!datesByWeekKey.has(key)) datesByWeekKey.set(key, []);
    datesByWeekKey.get(key)!.push(d);
  }

  // Index week entries by ISO week key (last one wins if duplicates exist)
  const weekEntryByKey = new Map<string, FinancialEntry>();
  for (const e of entries) {
    if (e.period_type !== "week") continue;
    const { year, week } = getISOWeek(e.date);
    const key = `${year}-W${String(week).padStart(2, "0")}`;
    if (datesByWeekKey.has(key)) weekEntryByKey.set(key, e);
  }

  // Dates blocked by a week entry (day entries here are ignored)
  const coveredByWeek = new Set<string>();
  for (const [key] of weekEntryByKey) {
    for (const d of datesByWeekKey.get(key) ?? []) coveredByWeek.add(d);
  }

  let totalRevenue = 0;
  let totalVariableExpenses = 0;

  // Apply week entries with proration
  for (const [key, we] of weekEntryByKey) {
    const datesInPeriod = datesByWeekKey.get(key) ?? [];
    if (datesInPeriod.length === 0) continue;
    const fraction = datesInPeriod.length / 7;
    totalRevenue += (Number(we.revenue) || 0) * fraction;
    totalVariableExpenses += (Number(we.expenses) || 0) * fraction;
    const revPerDay = (Number(we.revenue) || 0) / 7;
    const expPerDay = (Number(we.expenses) || 0) / 7;
    for (const d of datesInPeriod) {
      byDate.get(d)!.revenue += revPerDay;
      byDate.get(d)!.expenses += expPerDay;
    }
  }

  // Apply day entries (skip dates covered by a week entry)
  const dateSet = new Set(dates);
  for (const e of entries) {
    if (e.period_type !== "day") continue;
    if (!dateSet.has(e.date)) continue;
    if (coveredByWeek.has(e.date)) continue;
    const rev = Number(e.revenue) || 0;
    const exp = Number(e.expenses) || 0;
    totalRevenue += rev;
    totalVariableExpenses += exp;
    byDate.get(e.date)!.revenue += rev;
    byDate.get(e.date)!.expenses += exp;
  }

  return {
    totalRevenue: round2(totalRevenue),
    totalVariableExpenses: round2(totalVariableExpenses),
    byDate,
  };
}

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Compute all financial metrics for a date range.
 *
 * @param dates         Ordered YYYY-MM-DD array for the period.
 * @param entries       All FinancialEntry rows (engine filters and deduplicates
 *                      internally — safe to pass the full dataset).
 * @param employees     Active employees (for salary proration).
 * @param fixedExpenses Fixed expenses (for proration).
 * @param getLabel      Maps YYYY-MM-DD to the chart label for that date.
 */
export function computeAnalytics(
  dates: string[],
  entries: FinancialEntry[],
  employees: Pick<Employee, "monthly_salary">[],
  fixedExpenses: Pick<FixedExpense, "amount_monthly">[],
  getLabel: (dateISO: string) => string
): PeriodAnalytics {
  // ── Revenue & variable expenses ───────────────────────────────────────────

  const { totalRevenue: entryRevenue, totalVariableExpenses: variableExpenses, byDate } =
    resolveEntries(dates, entries);

  // ── Structural costs (calendar-day proration) ─────────────────────────────

  const totalMonthlySalary = employees.reduce((s, e) => s + (Number(e.monthly_salary) || 0), 0);
  const totalMonthlyFixed = fixedExpenses.reduce((s, e) => s + (Number(e.amount_monthly) || 0), 0);

  let salaryCost = 0;
  let fixedCost = 0;
  for (const dateISO of dates) {
    const ym = dateISO.slice(0, 7);
    const mdays = daysInMonth(ym);
    salaryCost += totalMonthlySalary / mdays;
    fixedCost += totalMonthlyFixed / mdays;
  }
  salaryCost = round2(salaryCost);
  fixedCost = round2(fixedCost);

  // ── Totals & profit ───────────────────────────────────────────────────────

  const totalRevenue = entryRevenue;
  const totalExpenses = round2(variableExpenses + salaryCost + fixedCost);
  const totalCosts = totalExpenses; // same formula, semantic alias for the UI
  const netProfit = round2(totalRevenue - totalExpenses);
  const profitMargin = totalRevenue > 0 ? round2((netProfit / totalRevenue) * 100) : 0;
  const isProfitable = netProfit >= 0;

  // ── Breakdowns ────────────────────────────────────────────────────────────

  const revMap = new Map<string, number>();
  if (entryRevenue > 0) revMap.set("Ganhos", entryRevenue);
  const revenueBreakdown = toBreakdown(revMap, totalRevenue);

  const expMap = new Map<string, number>();
  if (variableExpenses > 0) expMap.set("Despesas variáveis", variableExpenses);
  if (salaryCost > 0) expMap.set("Salários", salaryCost);
  if (fixedCost > 0) expMap.set("Despesas fixas", fixedCost);
  const expenseBreakdown = toBreakdown(expMap, totalExpenses);

  // ── By-day chart data ─────────────────────────────────────────────────────

  const byDay: DayData[] = dates.map((dateISO) => {
    const ym = dateISO.slice(0, 7);
    const mdays = daysInMonth(ym);
    const structuralPerDay = (totalMonthlySalary + totalMonthlyFixed) / mdays;

    const { revenue: dayRev, expenses: dayVarExp } = byDate.get(dateISO) ?? { revenue: 0, expenses: 0 };
    const dayTotalExp = round2(dayVarExp + structuralPerDay);
    return {
      date: dateISO,
      label: getLabel(dateISO),
      revenue: round2(dayRev),
      expenses: dayTotalExp,
      profit: round2(dayRev - dayTotalExp),
    };
  });

  // ── Insights ──────────────────────────────────────────────────────────────

  const insights: string[] = [];
  const structuralTotal = round2(salaryCost + fixedCost);

  // Overall result
  if (netProfit >= 0) {
    insights.push(`O período fechou com resultado positivo de ${fmtEuro(netProfit)}.`);
  } else {
    insights.push(`O período fechou com resultado negativo de ${fmtEuro(Math.abs(netProfit))}.`);
  }

  // Total costs
  if (totalCosts > 0) {
    insights.push(`Os custos totais do período foram ${fmtEuro(totalCosts)}.`);
  }

  // Variable expenses as % of total costs
  if (totalCosts > 0 && variableExpenses > 0) {
    const pct = Math.round((variableExpenses / totalCosts) * 100);
    insights.push(`As despesas variáveis representaram ${pct}% dos custos totais.`);
  }

  // Structural costs as % of total costs
  if (totalCosts > 0 && structuralTotal > 0) {
    const pct = Math.round((structuralTotal / totalCosts) * 100);
    insights.push(`Os custos estruturais representaram ${pct}% dos custos totais (salários ${fmtEuro(salaryCost)}, despesas fixas ${fmtEuro(fixedCost)}).`);
  }

  // Critical: gains don't cover structural costs
  if (structuralTotal > 0 && entryRevenue > 0 && entryRevenue < structuralTotal) {
    insights.push(`Os ganhos não chegaram para cobrir os custos estruturais do período.`);
  }

  return {
    totalRevenue,
    entryRevenue,
    totalExpenses,
    totalCosts,
    salaryCost,
    fixedCost,
    variableExpenses,
    revenueBreakdown,
    expenseBreakdown,
    netProfit,
    profitMargin,
    isProfitable,
    byDay,
    insights,
  };
}
