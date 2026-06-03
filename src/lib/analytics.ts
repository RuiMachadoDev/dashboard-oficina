/**
 * Central financial analytics engine — financial cockpit model.
 *
 * Revenue sources (no double-counting):
 *   1. financial_movements where type = 'income'        ← PRIMARY
 *   2. services with labor_billed explicitly set         ← OPTIONAL (direct entry)
 *      (services without labor_billed are excluded — they belong to the legacy
 *       operational model and are not included in primary analytics)
 *
 * Expense sources (no double-counting):
 *   1. Employee salaries → prorated from Settings (monthly_salary / daysInMonth)
 *   2. Fixed expenses    → prorated from Settings (amount_monthly / daysInMonth)
 *   3. financial_movements where type = 'expense'
 *      (do NOT add salaries or fixed expenses as movements — they are already
 *       counted above; use Movimentos only for variable/one-off costs)
 *
 * The hourly rate and time entries play no role here.
 * For per-service legacy calculations, see resolveServiceLaborBilled (legacy helper).
 */

import type {
  Employee,
  FinancialMovement,
  FixedExpense,
  FixedExpenseHistory,
  Service,
  TimeEntry,
} from "../types";
import { daysInMonth } from "./dates";
import { round2 } from "./format";

// ── Public helpers ────────────────────────────────────────────────────────────

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

/**
 * Legacy helper — resolves labor revenue for a single service.
 * Used by ServicosPage / ServicoDetalhePage for per-service margin display.
 * NOT used in computeAnalytics (which only counts explicit labor_billed).
 */
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
  /** Revenue from services with explicit labor_billed */
  serviceRevenue: number;
  /** Revenue from financial_movements (income) */
  movementIncome: number;
  revenueBreakdown: CategoryAmount[];

  totalExpenses: number;
  /** Prorated employee salaries from Settings */
  salaryCost: number;
  /** Prorated fixed expenses from Settings */
  fixedCost: number;
  /** Expense financial_movements */
  movementExpenses: number;
  expenseBreakdown: CategoryAmount[];

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

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Compute all financial metrics for a date range.
 *
 * @param dates         Ordered YYYY-MM-DD array for the period.
 * @param services      Services whose service_date is within the period.
 *                      Only services with explicit labor_billed contribute.
 * @param employees     Active employees (for salary proration).
 * @param fixedExpenses Fixed expenses (for proration).
 * @param movements     FinancialMovements within the period.
 * @param getLabel      Maps YYYY-MM-DD to the chart label for that date.
 */
export function computeAnalytics(
  dates: string[],
  services: Service[],
  employees: Pick<Employee, "monthly_salary">[],
  fixedExpenses: Pick<FixedExpense, "amount_monthly">[],
  movements: FinancialMovement[],
  getLabel: (dateISO: string) => string
): PeriodAnalytics {
  // ── Revenue ──────────────────────────────────────────────────────────────────
  // Only services with an explicit labor_billed amount count.
  // Services that relied on time_entries × rate are excluded (legacy model).

  let serviceRevenue = 0;
  const explicitServices = services.filter(
    (s) => s.labor_billed !== null && s.labor_billed !== undefined
  );
  for (const svc of explicitServices) {
    serviceRevenue += Number(svc.labor_billed) || 0;
    serviceRevenue += Number(svc.material_billed) || 0;
  }
  serviceRevenue = round2(serviceRevenue);

  const incomeByCategory = new Map<string, number>();
  let movementIncome = 0;
  for (const m of movements) {
    if (m.type !== "income") continue;
    const amt = Number(m.amount) || 0;
    movementIncome += amt;
    incomeByCategory.set(m.category, (incomeByCategory.get(m.category) ?? 0) + amt);
  }
  movementIncome = round2(movementIncome);

  const totalRevenue = round2(serviceRevenue + movementIncome);

  // ── Expenses ─────────────────────────────────────────────────────────────────
  // Structural costs (salaries + fixed expenses) are always prorated.
  // Movements add variable/one-off costs on top.
  // Do NOT include salaries or fixed expenses as movements — that would double-count.

  let salaryCost = 0;
  let fixedCost = 0;
  for (const dateISO of dates) {
    const ym = dateISO.slice(0, 7);
    const mdays = daysInMonth(ym);
    const totalSalary = employees.reduce((s, e) => s + (Number(e.monthly_salary) || 0), 0);
    const totalFixed = fixedExpenses.reduce((s, e) => s + (Number(e.amount_monthly) || 0), 0);
    salaryCost += totalSalary / mdays;
    fixedCost += totalFixed / mdays;
  }
  salaryCost = round2(salaryCost);
  fixedCost = round2(fixedCost);

  const expenseByCategory = new Map<string, number>();
  let movementExpenses = 0;
  for (const m of movements) {
    if (m.type !== "expense") continue;
    const amt = Number(m.amount) || 0;
    movementExpenses += amt;
    expenseByCategory.set(m.category, (expenseByCategory.get(m.category) ?? 0) + amt);
  }
  movementExpenses = round2(movementExpenses);

  const totalExpenses = round2(salaryCost + fixedCost + movementExpenses);

  // ── Profit ────────────────────────────────────────────────────────────────────

  const netProfit = round2(totalRevenue - totalExpenses);
  const profitMargin = totalRevenue > 0 ? round2((netProfit / totalRevenue) * 100) : 0;
  const isProfitable = netProfit >= 0;

  // ── Breakdowns ────────────────────────────────────────────────────────────────

  const revMap = new Map<string, number>();
  // Income movements contribute with their own categories
  for (const [cat, amt] of incomeByCategory) {
    revMap.set(cat, (revMap.get(cat) ?? 0) + amt);
  }
  // Explicit service revenue as a named category (only if non-zero)
  if (serviceRevenue > 0) {
    revMap.set("Serviços (direto)", (revMap.get("Serviços (direto)") ?? 0) + serviceRevenue);
  }
  const revenueBreakdown = toBreakdown(revMap, totalRevenue);

  const expMap = new Map<string, number>();
  if (salaryCost > 0) expMap.set("Salários (estimado)", salaryCost);
  if (fixedCost > 0) expMap.set("Custos fixos (estimado)", fixedCost);
  for (const [cat, amt] of expenseByCategory) {
    expMap.set(cat, (expMap.get(cat) ?? 0) + amt);
  }
  const expenseBreakdown = toBreakdown(expMap, totalExpenses);

  // ── By-day data ───────────────────────────────────────────────────────────────

  const explicitServicesByDate = new Map<string, Service[]>();
  for (const svc of explicitServices) {
    const arr = explicitServicesByDate.get(svc.service_date) ?? [];
    arr.push(svc);
    explicitServicesByDate.set(svc.service_date, arr);
  }

  const movementsByDate = new Map<string, FinancialMovement[]>();
  for (const m of movements) {
    const arr = movementsByDate.get(m.date) ?? [];
    arr.push(m);
    movementsByDate.set(m.date, arr);
  }

  const byDay: DayData[] = dates.map((dateISO) => {
    const ym = dateISO.slice(0, 7);
    const mdays = daysInMonth(ym);

    const daySvcs = explicitServicesByDate.get(dateISO) ?? [];
    const dayMvts = movementsByDate.get(dateISO) ?? [];

    const daySvcRevenue = round2(
      daySvcs.reduce(
        (s, svc) =>
          s + (Number(svc.labor_billed) || 0) + (Number(svc.material_billed) || 0),
        0
      )
    );
    const dayIncomeMovements = round2(
      dayMvts
        .filter((m) => m.type === "income")
        .reduce((s, m) => s + (Number(m.amount) || 0), 0)
    );
    const dayRevenue = round2(daySvcRevenue + dayIncomeMovements);

    const totalSalary = employees.reduce((s, e) => s + (Number(e.monthly_salary) || 0), 0);
    const totalFixed = fixedExpenses.reduce((s, e) => s + (Number(e.amount_monthly) || 0), 0);
    const dayExpMovements = round2(
      dayMvts
        .filter((m) => m.type === "expense")
        .reduce((s, m) => s + (Number(m.amount) || 0), 0)
    );
    const dayExpenses = round2(totalSalary / mdays + totalFixed / mdays + dayExpMovements);

    return {
      date: dateISO,
      label: getLabel(dateISO),
      revenue: dayRevenue,
      expenses: dayExpenses,
      profit: round2(dayRevenue - dayExpenses),
    };
  });

  // ── Insights ──────────────────────────────────────────────────────────────────

  const insights: string[] = [];

  if (totalExpenses > 0) {
    if (salaryCost > 0) {
      const pct = Math.round((salaryCost / totalExpenses) * 100);
      insights.push(`Salários: ${pct}% das despesas totais (${fmtEuro(salaryCost)})`);
    }
    if (fixedCost > 0) {
      const pct = Math.round((fixedCost / totalExpenses) * 100);
      insights.push(`Custos fixos: ${pct}% das despesas totais (${fmtEuro(fixedCost)})`);
    }
    if (movementExpenses > 0) {
      const pct = Math.round((movementExpenses / totalExpenses) * 100);
      insights.push(`Movimentos de despesa: ${pct}% (${fmtEuro(movementExpenses)})`);
    }
  }

  if (!isProfitable && totalExpenses > 0) {
    insights.push(
      `A receita ficou ${fmtEuro(Math.abs(netProfit))} abaixo das despesas — prejuízo`
    );
  }

  if (salaryCost > 0 && totalRevenue > 0 && totalRevenue < salaryCost) {
    insights.push("A receita não chegou sequer para cobrir os salários do período");
  }

  const daysByRevenue = [...byDay].sort((a, b) => b.revenue - a.revenue);
  if (daysByRevenue[0]?.revenue > 0) {
    insights.push(
      `Melhor dia de receita: ${daysByRevenue[0].label} (${fmtEuro(daysByRevenue[0].revenue)})`
    );
  }

  const daysByProfit = [...byDay].sort((a, b) => a.profit - b.profit);
  if (daysByProfit[0]?.profit < 0) {
    insights.push(
      `Pior dia: ${daysByProfit[0].label} (${fmtEuro(daysByProfit[0].profit)})`
    );
  }

  return {
    totalRevenue,
    serviceRevenue,
    movementIncome,
    revenueBreakdown,
    totalExpenses,
    salaryCost,
    fixedCost,
    movementExpenses,
    expenseBreakdown,
    netProfit,
    profitMargin,
    isProfitable,
    byDay,
    insights,
  };
}
