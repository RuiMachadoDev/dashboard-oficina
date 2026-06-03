import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { supabase } from "../lib/supabase";
import type { Employee, FinancialEntry, FixedExpense } from "../types";
import { euro, round2 } from "../lib/format";
import {
  addMonths,
  currentISOWeek,
  dayChartLabel,
  formatWeekRange,
  formatYM,
  getISOWeek,
  getMonthDays,
  getWeekDays,
  getYearMonths,
  PT_MONTHS_SHORT,
  shiftWeek,
  todayYM,
} from "../lib/dates";
import { loadActiveEmployees } from "../lib/healthCheck";
import {
  computeAnalytics,
  type PeriodAnalytics,
  type DayData,
} from "../lib/analytics";
import { Card } from "../components/ui/Card";
import { MonthPicker } from "../components/ui/MonthPicker";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Target,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ── Period state ──────────────────────────────────────────────────────────────

type Tab = "week" | "month" | "year";

const LS_TAB   = "dashboard.tab";
const LS_WEEK  = "dashboard.week";
const LS_MONTH = "dashboard.month";
const LS_YEAR  = "dashboard.year";

function loadLS<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveLS(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

// ── Chart formatters ──────────────────────────────────────────────────────────

const fmtEuro = (v: number) => `€${v.toFixed(0)}`;

function RevenueExpensesChart({ data }: { data: DayData[] }) {
  const chartData = data.map((d) => ({
    name: d.label,
    Receita: d.revenue,
    Despesas: d.expenses,
  }));
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={chartData} barGap={2} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} axisLine={false} tickFormatter={fmtEuro} width={52} />
        <Tooltip
          formatter={(v, name) => [euro(Number(v ?? 0)), String(name)]}
          contentStyle={{ border: "1px solid #e4e4e7", borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="Receita" fill="#10b981" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Despesas" fill="#f43f5e" radius={[3, 3, 0, 0]} opacity={0.8} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ProfitChart({ data }: { data: DayData[] }) {
  const chartData = data.map((d) => ({ name: d.label, Resultado: d.profit }));
  return (
    <ResponsiveContainer width="100%" height={120}>
      <BarChart data={chartData} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} axisLine={false} />
        <ReferenceLine y={0} stroke="#e4e4e7" />
        <Tooltip
          formatter={(v) => [euro(Number(v ?? 0)), "Resultado"]}
          contentStyle={{ border: "1px solid #e4e4e7", borderRadius: 8, fontSize: 12 }}
        />
        <Bar dataKey="Resultado" radius={[3, 3, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.Resultado >= 0 ? "#10b981" : "#f43f5e"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [tab, setTab] = useState<Tab>(() => loadLS<Tab>(LS_TAB, "week"));
  const [weekPeriod, setWeekPeriod] = useState(() =>
    loadLS<{ year: number; week: number }>(LS_WEEK, currentISOWeek())
  );
  const [month, setMonth] = useState<string>(() => loadLS<string>(LS_MONTH, todayYM()));
  const [year, setYear] = useState<number>(() => loadLS<number>(LS_YEAR, new Date().getFullYear()));

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [financialEntries, setFinancialEntries] = useState<FinancialEntry[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAll(silent = false) {
    if (!silent) setLoading(true);

    const twoYearsAgo = `${new Date().getFullYear() - 2}-01-01`;

    try {
      const [entriesRes, fxRes, empData] = await Promise.all([
        supabase.from("financial_entries").select("*").gte("date", twoYearsAgo),
        supabase.from("fixed_expenses").select("id, name, amount_monthly"),
        loadActiveEmployees<Employee>("id, name, monthly_salary, monthly_hours"),
      ]);

      setEmployees(empData);
      setFinancialEntries(entriesRes.error ? [] : (entriesRes.data ?? []) as FinancialEntry[]);
      setFixedExpenses(fxRes.error ? [] : (fxRes.data ?? []) as FixedExpense[]);
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ch = supabase
      .channel("dashboard_v3")
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, () => loadAll(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "fixed_expenses" }, () => loadAll(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_entries" }, () => loadAll(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Period derivation ─────────────────────────────────────────────────────

  const periodLabel = useMemo(() => {
    if (tab === "week") return formatWeekRange(weekPeriod.year, weekPeriod.week);
    if (tab === "month") return formatYM(month);
    return String(year);
  }, [tab, weekPeriod, month, year]);

  // ── Analytics computation ─────────────────────────────────────────────────

  const analytics = useMemo((): PeriodAnalytics | null => {
    if (loading) return null;

    if (tab === "week") {
      const dates = getWeekDays(weekPeriod.year, weekPeriod.week);
      return computeAnalytics(dates, financialEntries, employees, fixedExpenses, dayChartLabel);
    }

    if (tab === "month") {
      const dates = getMonthDays(month);
      const weekKey = (dateISO: string) => {
        const { week } = getISOWeek(dateISO);
        return `Sem. ${week}`;
      };
      return computeAnalytics(dates, financialEntries, employees, fixedExpenses, weekKey);
    }

    // Year view: compute per month then aggregate
    const yearMonths = getYearMonths(year);
    const monthlyResults = yearMonths.map((ym) => {
      const days = getMonthDays(ym);
      const idx = parseInt(ym.slice(5, 7), 10) - 1;
      const label = PT_MONTHS_SHORT[idx];
      return computeAnalytics(days, financialEntries, employees, fixedExpenses, () => label);
    });

    const totals = monthlyResults.reduce(
      (acc, r) => ({
        totalRevenue: round2(acc.totalRevenue + r.totalRevenue),
        entryRevenue: round2(acc.entryRevenue + r.entryRevenue),
        totalExpenses: round2(acc.totalExpenses + r.totalExpenses),
        salaryCost: round2(acc.salaryCost + r.salaryCost),
        fixedCost: round2(acc.fixedCost + r.fixedCost),
        variableExpenses: round2(acc.variableExpenses + r.variableExpenses),
      }),
      { totalRevenue: 0, entryRevenue: 0, totalExpenses: 0, salaryCost: 0, fixedCost: 0, variableExpenses: 0 }
    );

    const netProfit = round2(totals.totalRevenue - totals.totalExpenses);
    const profitMargin = totals.totalRevenue > 0 ? round2((netProfit / totals.totalRevenue) * 100) : 0;

    const byDay: DayData[] = monthlyResults.map((r, i) => ({
      date: yearMonths[i],
      label: PT_MONTHS_SHORT[i],
      revenue: r.totalRevenue,
      expenses: r.totalExpenses,
      profit: r.netProfit,
    }));

    const expMap = new Map<string, number>();
    const revMap = new Map<string, number>();
    for (const r of monthlyResults) {
      for (const cat of r.expenseBreakdown) expMap.set(cat.category, (expMap.get(cat.category) ?? 0) + cat.amount);
      for (const cat of r.revenueBreakdown) revMap.set(cat.category, (revMap.get(cat.category) ?? 0) + cat.amount);
    }

    const mkBreakdown = (map: Map<string, number>, total: number) =>
      Array.from(map.entries())
        .map(([category, amount]) => ({ category, amount: round2(amount), pct: total > 0 ? round2((amount / total) * 100) : 0 }))
        .sort((a, b) => b.amount - a.amount);

    const insights: string[] = [];
    const bestMonth = byDay.reduce((best, d) => d.profit > best.profit ? d : best, byDay[0] ?? { profit: -Infinity, label: "" });
    const worstMonth = byDay.reduce((worst, d) => d.profit < worst.profit ? d : worst, byDay[0] ?? { profit: Infinity, label: "" });
    if (bestMonth && bestMonth.profit > -Infinity) insights.push(`Melhor mês: ${bestMonth.label} (${euro(bestMonth.profit)})`);
    if (worstMonth && worstMonth.profit < Infinity && worstMonth.label !== bestMonth?.label) {
      insights.push(`Pior mês: ${worstMonth.label} (${euro(worstMonth.profit)})`);
    }
    if (totals.salaryCost > 0 && totals.totalExpenses > 0) {
      insights.push(`Salários representaram ${Math.round((totals.salaryCost / totals.totalExpenses) * 100)}% das despesas anuais`);
    }

    return {
      ...totals,
      revenueBreakdown: mkBreakdown(revMap, totals.totalRevenue),
      expenseBreakdown: mkBreakdown(expMap, totals.totalExpenses),
      netProfit,
      profitMargin,
      isProfitable: netProfit >= 0,
      byDay,
      insights,
    };
  }, [tab, weekPeriod, month, year, financialEntries, employees, fixedExpenses, loading]);

  // ── Chart data (month view: group byDay by week key) ──────────────────────

  const chartData = useMemo(() => {
    if (!analytics) return [];
    if (tab !== "month") return analytics.byDay;
    const weeks = new Map<string, DayData>();
    for (const d of analytics.byDay) {
      const existing = weeks.get(d.label);
      if (existing) {
        existing.revenue = round2(existing.revenue + d.revenue);
        existing.expenses = round2(existing.expenses + d.expenses);
        existing.profit = round2(existing.profit + d.profit);
      } else {
        weeks.set(d.label, { ...d });
      }
    }
    return Array.from(weeks.values());
  }, [analytics, tab]);

  // ── Navigation handlers ───────────────────────────────────────────────────

  function switchTab(t: Tab) {
    setTab(t);
    saveLS(LS_TAB, t);
  }

  function prevPeriod() {
    if (tab === "week") {
      const w = shiftWeek(weekPeriod.year, weekPeriod.week, -1);
      setWeekPeriod(w); saveLS(LS_WEEK, w);
    } else if (tab === "month") {
      const m = addMonths(month, -1);
      setMonth(m); saveLS(LS_MONTH, m);
    } else {
      const y = year - 1; setYear(y); saveLS(LS_YEAR, y);
    }
  }

  function nextPeriod() {
    if (tab === "week") {
      const w = shiftWeek(weekPeriod.year, weekPeriod.week, 1);
      setWeekPeriod(w); saveLS(LS_WEEK, w);
    } else if (tab === "month") {
      const m = addMonths(month, 1);
      setMonth(m); saveLS(LS_MONTH, m);
    } else {
      const y = year + 1; setYear(y); saveLS(LS_YEAR, y);
    }
  }

  function goToNow() {
    if (tab === "week") {
      const w = currentISOWeek(); setWeekPeriod(w); saveLS(LS_WEEK, w);
    } else if (tab === "month") {
      const m = todayYM(); setMonth(m); saveLS(LS_MONTH, m);
    } else {
      const y = new Date().getFullYear(); setYear(y); saveLS(LS_YEAR, y);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const a = analytics;
  const coveragePct = a && a.totalExpenses > 0
    ? Math.min(100, Math.round((a.totalRevenue / a.totalExpenses) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {/* Period tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-xl border bg-white p-1 shadow-sm">
          {(["week", "month", "year"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === t ? "bg-zinc-900 text-white" : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {t === "week" ? "Semana" : t === "month" ? "Mês" : "Ano"}
            </button>
          ))}
        </div>

        {/* Period navigator */}
        <div className="flex items-center gap-2">
          <button
            onClick={prevPeriod}
            className="rounded-lg border bg-white p-2 hover:bg-zinc-50"
          >
            <ChevronLeft size={14} />
          </button>

          {tab === "month" ? (
            <MonthPicker value={month} onChange={(m) => { setMonth(m); saveLS(LS_MONTH, m); }} />
          ) : (
            <span className="min-w-48 text-center text-sm font-semibold">{periodLabel}</span>
          )}

          <button
            onClick={nextPeriod}
            className="rounded-lg border bg-white p-2 hover:bg-zinc-50"
          >
            <ChevronRight size={14} />
          </button>

          <button
            onClick={goToNow}
            className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
          >
            Hoje
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl border bg-white p-5 shadow-sm">
              <div className="h-3 w-24 rounded bg-zinc-100" />
              <div className="mt-4 h-7 w-32 rounded bg-zinc-100" />
            </div>
          ))}
        </div>
      ) : a ? (
        <>
          {/* ── KPI Cards ───────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">Receita registada</span>
                <span className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600">
                  <TrendingUp size={14} strokeWidth={2} />
                </span>
              </div>
              <div className="mt-3 text-2xl font-bold text-emerald-700">
                {euro(a.totalRevenue)}
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                receita das entradas financeiras
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">Custos estruturais</span>
                <span className="rounded-lg bg-rose-50 p-1.5 text-rose-500">
                  <TrendingDown size={14} strokeWidth={2} />
                </span>
              </div>
              <div className="mt-3 text-2xl font-bold text-rose-700">
                {euro(a.salaryCost + a.fixedCost)}
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                sal. {euro(a.salaryCost)} · fix. {euro(a.fixedCost)}
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">Resultado líquido</span>
                <span className={`rounded-lg p-1.5 ${a.isProfitable ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-500"}`}>
                  <Wallet size={14} strokeWidth={2} />
                </span>
              </div>
              <div className={`mt-3 text-2xl font-bold ${a.isProfitable ? "text-emerald-700" : "text-rose-700"}`}>
                {euro(a.netProfit)}
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                {a.netProfit >= 0 ? "+" : ""}{a.profitMargin.toFixed(1).replace(".", ",")}% margem
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">Cobertura</span>
                <span className="rounded-lg bg-zinc-100 p-1.5 text-zinc-400">
                  <Target size={14} strokeWidth={2} />
                </span>
              </div>
              <div className={`mt-3 text-2xl font-bold ${coveragePct >= 100 ? "text-emerald-700" : "text-zinc-800"}`}>
                {coveragePct}%
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className={`h-full rounded-full ${coveragePct >= 100 ? "bg-emerald-500" : "bg-zinc-400"}`}
                  style={{ width: `${Math.min(100, coveragePct)}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-zinc-400">receita vs despesas</div>
            </Card>
          </div>

          {/* ── Status banner ────────────────────────────────────────────── */}
          <div className={`rounded-2xl border p-5 shadow-sm ${a.isProfitable ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold tracking-wide ${a.isProfitable ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                  {a.isProfitable ? "OFICINA LUCRATIVA" : "OFICINA EM PREJUÍZO"}
                </span>
                <p className="mt-2 text-sm font-medium text-zinc-700">
                  {a.isProfitable
                    ? `A oficina gerou ${euro(a.netProfit)} de resultado líquido`
                    : `A oficina perdeu ${euro(Math.abs(a.netProfit))} — despesas superaram a receita`}
                </p>
              </div>
              <div className="flex gap-6 text-sm">
                <div>
                  <div className="text-xs text-zinc-500">Receita registada</div>
                  <div className="font-bold text-emerald-700">{euro(a.totalRevenue)}</div>
                </div>
                <div className="self-center text-zinc-300">−</div>
                <div>
                  <div className="text-xs text-zinc-500">Despesa variável</div>
                  <div className="font-bold text-rose-700">{euro(a.variableExpenses)}</div>
                </div>
                <div className="self-center text-zinc-300">−</div>
                <div>
                  <div className="text-xs text-zinc-500">Custos estruturais</div>
                  <div className="font-bold text-rose-700">{euro(a.salaryCost + a.fixedCost)}</div>
                </div>
                <div className="self-center text-zinc-300">=</div>
                <div>
                  <div className="text-xs text-zinc-500">Resultado líquido</div>
                  <div className={`font-bold ${a.isProfitable ? "text-emerald-700" : "text-rose-700"}`}>
                    {euro(a.netProfit)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Charts ───────────────────────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Receita vs Despesas</h2>
                <div className="flex gap-3 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />
                    Receita
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-sm bg-rose-500 opacity-80" />
                    Despesas
                  </span>
                </div>
              </div>
              <div className="mt-4">
                {chartData.length > 0 ? (
                  <RevenueExpensesChart data={chartData} />
                ) : (
                  <div className="flex h-52 items-center justify-center text-sm text-zinc-400">
                    Sem dados neste período
                  </div>
                )}
              </div>
            </Card>

            {/* Expense breakdown */}
            <Card className="lg:col-span-2">
              <h2 className="text-sm font-semibold">Despesas por categoria</h2>
              {a.expenseBreakdown.length === 0 ? (
                <div className="mt-4 text-sm text-zinc-400">Sem despesas registadas</div>
              ) : (
                <div className="mt-4 space-y-3">
                  {a.expenseBreakdown.map((cat) => (
                    <div key={cat.category}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium text-zinc-700">{cat.category}</span>
                        <span className="text-xs text-zinc-500">
                          {euro(cat.amount)} · {cat.pct}%
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className="h-full rounded-full bg-rose-400"
                          style={{ width: `${cat.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Profit by period chart */}
          {chartData.some((d) => d.profit !== 0) && (
            <Card>
              <h2 className="text-sm font-semibold">
                Resultado líquido por {tab === "year" ? "mês" : tab === "month" ? "semana" : "dia"}
              </h2>
              <div className="mt-3">
                <ProfitChart data={chartData} />
              </div>
            </Card>
          )}

          {/* Insights */}
          {a.insights.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold">
                {a.isProfitable ? "Por que ganhámos dinheiro?" : "Por que perdemos dinheiro?"}
              </h2>
              <ul className="mt-3 space-y-1.5">
                {a.insights.map((ins, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-700">
                    <span className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${a.isProfitable ? "bg-emerald-500" : "bg-rose-500"}`} />
                    {ins}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
