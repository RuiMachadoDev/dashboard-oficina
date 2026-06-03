/**
 * Relatórios — historical financial analysis.
 *
 * Revenue = financial_movements (income) + services with explicit labor_billed.
 * Expenses = prorated salaries + prorated fixed expenses + movement expenses.
 * No time-entry-based service revenue is included (legacy operational model).
 */
import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "../lib/supabase";
import type {
  Employee,
  FinancialMovement,
  FixedExpense,
  FixedExpenseHistory,
  Service,
} from "../types";
import { euro, round2 } from "../lib/format";
import { addMonths, getMonthDays, todayYM } from "../lib/dates";
import { loadActiveEmployees } from "../lib/healthCheck";
import {
  buildHistoricalFixedExpenses,
  computeAnalytics,
} from "../lib/analytics";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { MonthPicker } from "../components/ui/MonthPicker";
import { TrendingUp, TrendingDown } from "lucide-react";

const MONTH_KEY = "reports.month";

function getInitialMonth() {
  try {
    const v = localStorage.getItem(MONTH_KEY);
    return v && /^\d{4}-\d{2}$/.test(v) ? v : todayYM();
  } catch {
    return todayYM();
  }
}

const fmtEuro = (v: number) => `€${v.toFixed(0)}`;

export default function RelatoriosPage() {
  const [month, setMonth] = useState(getInitialMonth);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [movements, setMovements] = useState<FinancialMovement[]>([]);
  const [fixedExpenseHistory, setFixedExpenseHistory] = useState<FixedExpenseHistory[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    try {
      const [svcRes, fxRes, mvtRes, fxhRes, empData] = await Promise.all([
        supabase.from("services").select("id, service_date, material_billed, labor_billed"),
        supabase.from("fixed_expenses").select("id, amount_monthly"),
        supabase.from("financial_movements").select("id, date, type, category, amount"),
        supabase.from("fixed_expenses_history").select("id, expense_id, amount, valid_from"),
        loadActiveEmployees<Employee>("id, monthly_salary"),
      ]);

      setEmployees(empData);
      setServices(svcRes.error ? [] : (svcRes.data ?? []) as Service[]);
      setFixedExpenses(fxRes.error ? [] : (fxRes.data ?? []) as FixedExpense[]);
      setMovements(mvtRes.error ? [] : (mvtRes.data ?? []) as FinancialMovement[]);
      if (!fxhRes.error) setFixedExpenseHistory((fxhRes.data ?? []) as FixedExpenseHistory[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ch = supabase
      .channel("reports_v3")
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_movements" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "services" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "fixed_expenses" }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Current-month analytics ────────────────────────────────────────────────

  const currentMonthAnalytics = useMemo(() => {
    if (loading) return null;
    const days = getMonthDays(month);
    const [start, end] = [days[0], days[days.length - 1]];
    const svcs = services.filter((s) => s.service_date >= start && s.service_date <= end);
    const mvts = movements.filter((m) => m.date >= start && m.date <= end);
    return computeAnalytics(days, svcs, employees, fixedExpenses, mvts, () => "");
  }, [loading, month, services, employees, fixedExpenses, movements]);

  // ── 6-month trend with historically-accurate fixed expense amounts ──────────

  const trend6 = useMemo(() => {
    if (loading) return [];
    const months = [0, -1, -2, -3, -4, -5].map((d) => addMonths(month, d)).reverse();

    return months.map((ym) => {
      const days = getMonthDays(ym);
      const [start, end] = [days[0], days[days.length - 1]];

      // Use historical fixed expense amounts where available
      const historicalFixed =
        fixedExpenseHistory.length > 0
          ? buildHistoricalFixedExpenses(fixedExpenseHistory, ym)
          : fixedExpenses;

      const svcs = services.filter((s) => s.service_date >= start && s.service_date <= end);
      const mvts = movements.filter((m) => m.date >= start && m.date <= end);

      const a = computeAnalytics(days, svcs, employees, historicalFixed, mvts, () => "");
      return { ym, ...a };
    });
  }, [loading, month, services, employees, fixedExpenses, movements, fixedExpenseHistory]);

  // ── Period-over-period delta ────────────────────────────────────────────────

  const prevMonthAnalytics = useMemo(
    () => (trend6.length >= 2 ? trend6[trend6.length - 2] : null),
    [trend6]
  );

  const delta = useMemo(() => {
    if (!currentMonthAnalytics || !prevMonthAnalytics) return null;
    return {
      revenue: round2(currentMonthAnalytics.totalRevenue - prevMonthAnalytics.totalRevenue),
      expenses: round2(currentMonthAnalytics.totalExpenses - prevMonthAnalytics.totalExpenses),
      profit: round2(currentMonthAnalytics.netProfit - prevMonthAnalytics.netProfit),
    };
  }, [currentMonthAnalytics, prevMonthAnalytics]);

  function onMonthChange(v: string) {
    setMonth(v);
    try { localStorage.setItem(MONTH_KEY, v); } catch { /* ignore */ }
  }

  const isProfitable = (currentMonthAnalytics?.netProfit ?? 0) >= 0;

  const chartData = trend6.map((r) => ({
    name: r.ym.slice(5, 7) + "/" + r.ym.slice(2, 4),
    Receita: r.totalRevenue,
    Despesas: r.totalExpenses,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        subtitle="Receita = movimentos de entrada. Despesas = salários + custos fixos + movimentos de saída."
        actions={<MonthPicker value={month} onChange={onMonthChange} />}
      />

      {loading ? (
        <div className="text-sm text-zinc-500">A carregar…</div>
      ) : (
        <>
          {/* ── KPI cards ──────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <div className="text-sm text-zinc-500">Receita</div>
              <div className="mt-2 text-2xl font-bold text-emerald-700">
                {euro(currentMonthAnalytics?.totalRevenue ?? 0)}
              </div>
              {delta && (
                <div className={`mt-1 flex items-center gap-1 text-xs ${delta.revenue >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {delta.revenue >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {delta.revenue >= 0 ? "+" : ""}{euro(delta.revenue)} vs mês anterior
                </div>
              )}
            </Card>

            <Card>
              <div className="text-sm text-zinc-500">Despesas</div>
              <div className="mt-2 text-2xl font-bold text-rose-700">
                {euro(currentMonthAnalytics?.totalExpenses ?? 0)}
              </div>
              {currentMonthAnalytics && (
                <div className="mt-1 text-xs text-zinc-400">
                  sal. {euro(currentMonthAnalytics.salaryCost)} · fix. {euro(currentMonthAnalytics.fixedCost)}
                  {currentMonthAnalytics.movementExpenses > 0 && ` · extra ${euro(currentMonthAnalytics.movementExpenses)}`}
                </div>
              )}
            </Card>

            <Card>
              <div className="text-sm text-zinc-500">Resultado</div>
              <div className={`mt-2 text-2xl font-bold ${isProfitable ? "text-emerald-700" : "text-rose-700"}`}>
                {euro(currentMonthAnalytics?.netProfit ?? 0)}
              </div>
              {delta && (
                <div className={`mt-1 flex items-center gap-1 text-xs ${delta.profit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {delta.profit >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {delta.profit >= 0 ? "+" : ""}{euro(delta.profit)} vs mês anterior
                </div>
              )}
            </Card>

            <Card>
              <div className="text-sm text-zinc-500">Margem</div>
              <div className={`mt-2 text-2xl font-bold ${isProfitable ? "text-emerald-700" : "text-rose-700"}`}>
                {(currentMonthAnalytics?.profitMargin ?? 0).toFixed(1).replace(".", ",")}%
              </div>
              <div className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${isProfitable ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                {isProfitable ? "LUCRATIVO" : "PREJUÍZO"}
              </div>
            </Card>
          </div>

          {/* ── Expense breakdown ─────────────────────────────────────── */}
          {currentMonthAnalytics && currentMonthAnalytics.expenseBreakdown.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold">Despesas por categoria — {month}</h2>
              <div className="mt-4 space-y-2.5">
                {currentMonthAnalytics.expenseBreakdown.map((cat) => (
                  <div key={cat.category}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-zinc-700">{cat.category}</span>
                      <span className="text-zinc-500">{euro(cat.amount)} · {cat.pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full rounded-full bg-rose-400" style={{ width: `${cat.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ── 6-month evolution ─────────────────────────────────────── */}
          <Card>
            <h2 className="text-sm font-semibold">Evolução dos últimos 6 meses</h2>
            <div className="mt-1 text-xs text-zinc-500">
              Despesas fixas calculadas com os valores históricos de cada mês.
            </div>

            <div className="mt-4">
              <ResponsiveContainer width="100%" height={200}>
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
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Mês</th>
                    <th className="px-3 py-2 text-right">Receita</th>
                    <th className="px-3 py-2 text-right">Despesas</th>
                    <th className="px-3 py-2 text-right">Resultado</th>
                    <th className="px-3 py-2 text-right">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {trend6.map((r) => (
                    <tr key={r.ym} className={`border-t ${r.ym === month ? "bg-zinc-50" : ""}`}>
                      <td className="px-3 py-2 font-medium">{r.ym}{r.ym === month ? " ●" : ""}</td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-700">{euro(r.totalRevenue)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-rose-700">{euro(r.totalExpenses)}</td>
                      <td className={`px-3 py-2 text-right font-bold ${r.netProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {euro(r.netProfit)}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-500">
                        {r.profitMargin.toFixed(1).replace(".", ",")}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ── Insights ────────────────────────────────────────────────── */}
          {currentMonthAnalytics && currentMonthAnalytics.insights.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold">
                {isProfitable ? "Por que ganhámos?" : "Por que perdemos?"}
              </h2>
              <ul className="mt-3 space-y-1.5">
                {currentMonthAnalytics.insights.map((ins, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-zinc-700">
                    <span className={`mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full ${isProfitable ? "bg-emerald-500" : "bg-rose-500"}`} />
                    {ins}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
