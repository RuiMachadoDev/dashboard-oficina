/**
 * Relatórios — historical financial analysis.
 *
 * Revenue = financial_entries.revenue (day or week entries, week wins over day).
 * Variable expenses = financial_entries.expenses.
 * Structural costs = prorated salaries + prorated fixed expenses.
 * Net result = revenue − variable expenses − structural costs.
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
import type { Employee, FinancialEntry, FixedExpense, FixedExpenseHistory } from "../types";
import { euro } from "../lib/format";
import { addMonths, getMonthDays, todayYM } from "../lib/dates";
import { loadActiveEmployees } from "../lib/healthCheck";
import {
  buildHistoricalFixedExpenses,
  computeAnalytics,
} from "../lib/analytics";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { MonthPicker } from "../components/ui/MonthPicker";

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
  const [financialEntries, setFinancialEntries] = useState<FinancialEntry[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [fixedExpenseHistory, setFixedExpenseHistory] = useState<FixedExpenseHistory[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    try {
      const [entriesRes, fxRes, fxhRes, empData] = await Promise.all([
        supabase.from("financial_entries").select("*"),
        supabase.from("fixed_expenses").select("id, amount_monthly"),
        supabase.from("fixed_expenses_history").select("id, expense_id, amount, valid_from"),
        loadActiveEmployees<Employee>("id, monthly_salary"),
      ]);

      setEmployees(empData);
      setFinancialEntries(entriesRes.error ? [] : (entriesRes.data ?? []) as FinancialEntry[]);
      setFixedExpenses(fxRes.error ? [] : (fxRes.data ?? []) as FixedExpense[]);
      if (!fxhRes.error) setFixedExpenseHistory((fxhRes.data ?? []) as FixedExpenseHistory[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ch = supabase
      .channel("reports_v4")
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_entries" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "fixed_expenses" }, loadAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Current-month analytics ────────────────────────────────────────────────

  const currentMonthAnalytics = useMemo(() => {
    if (loading) return null;
    const days = getMonthDays(month);
    return computeAnalytics(days, financialEntries, employees, fixedExpenses, () => "");
  }, [loading, month, financialEntries, employees, fixedExpenses]);

  // ── 6-month trend with historically-accurate fixed expense amounts ──────────

  const trend6 = useMemo(() => {
    if (loading) return [];
    const months = [0, -1, -2, -3, -4, -5].map((d) => addMonths(month, d)).reverse();

    return months.map((ym) => {
      const days = getMonthDays(ym);
      const historicalFixed =
        fixedExpenseHistory.length > 0
          ? buildHistoricalFixedExpenses(fixedExpenseHistory, ym)
          : fixedExpenses;

      const a = computeAnalytics(days, financialEntries, employees, historicalFixed, () => "");
      return { ym, ...a };
    });
  }, [loading, month, financialEntries, employees, fixedExpenses, fixedExpenseHistory]);


  function onMonthChange(v: string) {
    setMonth(v);
    try { localStorage.setItem(MONTH_KEY, v); } catch { /* ignore */ }
  }

  const isProfitable = (currentMonthAnalytics?.netProfit ?? 0) >= 0;

  const chartData = trend6.map((r) => ({
    name: r.ym.slice(5, 7) + "/" + r.ym.slice(2, 4),
    Ganhos: r.entryRevenue,
    Despesas: r.totalExpenses,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        subtitle="Receita = entradas financeiras. Despesas = despesa variável + salários + custos fixos."
        actions={<MonthPicker value={month} onChange={onMonthChange} />}
      />

      {loading ? (
        <div className="text-sm text-zinc-500">A carregar…</div>
      ) : (
        <>
          {/* ── KPI cards ──────────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <div className="text-sm text-zinc-500">Ganhos</div>
              <div className="mt-2 text-xl font-bold text-emerald-700">
                {euro(currentMonthAnalytics?.entryRevenue ?? 0)}
              </div>
              <div className="mt-1 text-xs text-zinc-400">registados no mês</div>
            </Card>

            <Card>
              <div className="text-sm text-zinc-500">Desp. variáveis</div>
              <div className="mt-2 text-xl font-bold text-rose-700">
                {euro(currentMonthAnalytics?.variableExpenses ?? 0)}
              </div>
              <div className="mt-1 text-xs text-zinc-400">registadas no mês</div>
            </Card>

            <Card>
              <div className="text-sm text-zinc-500">Custos estruturais</div>
              <div className="mt-2 text-xl font-bold text-amber-700">
                {euro((currentMonthAnalytics?.salaryCost ?? 0) + (currentMonthAnalytics?.fixedCost ?? 0))}
              </div>
              {currentMonthAnalytics && (
                <div className="mt-1 text-xs text-zinc-400">
                  sal. {euro(currentMonthAnalytics.salaryCost)} · fix. {euro(currentMonthAnalytics.fixedCost)}
                </div>
              )}
            </Card>

            <Card>
              <div className="text-sm text-zinc-500">Custos totais</div>
              <div className="mt-2 text-xl font-bold text-zinc-800">
                {euro(currentMonthAnalytics?.totalCosts ?? 0)}
              </div>
              <div className="mt-1 text-xs text-zinc-400">desp. var. + estruturais</div>
            </Card>

            <Card>
              <div className="text-sm text-zinc-500">Resultado líquido</div>
              <div className={`mt-2 text-xl font-bold ${isProfitable ? "text-emerald-700" : "text-rose-700"}`}>
                {euro(currentMonthAnalytics?.netProfit ?? 0)}
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
              Custos fixos calculados com os valores históricos de cada mês.
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
                  <Bar dataKey="Ganhos" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Despesas" fill="#f43f5e" radius={[3, 3, 0, 0]} opacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Período</th>
                    <th className="px-3 py-2 text-right">Ganhos</th>
                    <th className="px-3 py-2 text-right">Desp. variáveis</th>
                    <th className="px-3 py-2 text-right">Salários</th>
                    <th className="px-3 py-2 text-right">Desp. fixas</th>
                    <th className="px-3 py-2 text-right">Custos totais</th>
                    <th className="px-3 py-2 text-right">Resultado líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {trend6.map((r) => (
                    <tr key={r.ym} className={`border-t ${r.ym === month ? "bg-zinc-50" : ""}`}>
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{r.ym}{r.ym === month ? " ●" : ""}</td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-700 whitespace-nowrap">{euro(r.entryRevenue)}</td>
                      <td className="px-3 py-2 text-right text-zinc-600 whitespace-nowrap">{euro(r.variableExpenses)}</td>
                      <td className="px-3 py-2 text-right text-zinc-600 whitespace-nowrap">{euro(r.salaryCost)}</td>
                      <td className="px-3 py-2 text-right text-zinc-600 whitespace-nowrap">{euro(r.fixedCost)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-zinc-800 whitespace-nowrap">{euro(r.totalCosts)}</td>
                      <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${r.netProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                        {euro(r.netProfit)}
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
