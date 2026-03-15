import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Employee, FixedExpense, Service, TimeEntry } from "../types";
import { euro } from "../lib/format";
import { todayYM } from "../lib/dates";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { MonthPicker } from "../components/ui/MonthPicker";
import { TrendingUp, Users, Receipt, Landmark } from "lucide-react";
import {
  buildCostPerHourMap,
  calcCusto,
  calcFaturado,
  calcFixedExpensesTotal,
  calcLucroLiquido,
  calcTotalHours,
  filterEntriesByServiceIds,
  filterServiceIdsByMonth,
} from "../lib/finance";

const MONTH_KEY = "dashboard.month";

function getInitialMonth() {
  try {
    const v = localStorage.getItem(MONTH_KEY);
    return v && /^\d{4}-\d{2}$/.test(v) ? v : todayYM();
  } catch {
    return todayYM();
  }
}

export default function DashboardPage() {
  const [month, setMonth] = useState(getInitialMonth);

  const [hourlyRate, setHourlyRate] = useState<number>(31);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);

  const [loading, setLoading] = useState(true);

  async function loadAll(opts?: { silent?: boolean }) {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);

    try {
      const settingsRes = await supabase
        .from("settings")
        .select("hourly_rate")
        .eq("id", 1)
        .maybeSingle();

      if (!settingsRes.error && settingsRes.data?.hourly_rate != null) {
        setHourlyRate(Number(settingsRes.data.hourly_rate));
      } else if (settingsRes.error) {
        console.error("load settings failed:", settingsRes.error);
      }

      const empRes = await supabase
        .from("employees")
        .select("id, monthly_salary, monthly_hours");

      if (empRes.error) {
        console.error("load employees failed:", empRes.error);
        setEmployees([]);
      } else {
        setEmployees((empRes.data ?? []) as Employee[]);
      }

      const svcRes = await supabase.from("services").select("id, service_date");

      if (svcRes.error) {
        console.error("load services failed:", svcRes.error);
        setServices([]);
      } else {
        setServices((svcRes.data ?? []) as Service[]);
      }

      const teRes = await supabase
        .from("time_entries")
        .select("id, service_id, employee_id, hours, entry_date");

      if (teRes.error) {
        console.error("load time_entries failed:", teRes.error);
        setTimeEntries([]);
      } else {
        setTimeEntries((teRes.data ?? []) as TimeEntry[]);
      }

      const fxRes = await supabase
        .from("fixed_expenses")
        .select("id, name, amount_monthly");

      if (fxRes.error) {
        console.error("load fixed_expenses failed:", fxRes.error);
        setFixedExpenses([]);
      } else {
        setFixedExpenses((fxRes.data ?? []) as FixedExpense[]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel("dashboard_fixed_expenses_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fixed_expenses" },
        () => {
          loadAll({ silent: true });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const employeeCostPerHourById = useMemo(
    () => buildCostPerHourMap(employees),
    [employees]
  );

  const monthServiceIds = useMemo(
    () => filterServiceIdsByMonth(services, month),
    [services, month]
  );

  const monthEntries = useMemo(
    () => filterEntriesByServiceIds(timeEntries, monthServiceIds),
    [timeEntries, monthServiceIds]
  );

  const totals = useMemo(() => {
    const totalHours = calcTotalHours(monthEntries);
    const faturado = calcFaturado(totalHours, hourlyRate);
    const custo = calcCusto(monthEntries, employeeCostPerHourById);
    const despesasFixas = calcFixedExpensesTotal(fixedExpenses);
    const lucroLiquido = calcLucroLiquido(faturado, custo, despesasFixas);
    return { totalHours, faturado, custo, despesasFixas, lucroLiquido };
  }, [monthEntries, hourlyRate, employeeCostPerHourById, fixedExpenses]);

  const isProfitable = totals.lucroLiquido >= 0;

  function onMonthChange(v: string) {
    setMonth(v);
    try {
      localStorage.setItem(MONTH_KEY, v);
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Visão mensal · mão-de-obra e despesas fixas"
        actions={
          <div className="flex items-end gap-3">
            <MonthPicker value={month} onChange={onMonthChange} />

            <div className="rounded-xl border bg-white px-4 py-2.5 shadow-sm">
              <div className="text-xs text-zinc-400">Tarifa/hora</div>
              <div className="text-base font-bold">{euro(hourlyRate)}</div>
            </div>
          </div>
        }
      />

      {loading ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl border bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="h-3 w-24 rounded bg-zinc-100" />
                  <div className="h-6 w-6 rounded-lg bg-zinc-100" />
                </div>
                <div className="mt-4 h-7 w-32 rounded bg-zinc-100" />
                <div className="mt-2 h-2.5 w-16 rounded bg-zinc-100" />
              </div>
            ))}
          </div>
          <div className="animate-pulse rounded-2xl border bg-white p-6 shadow-sm">
            <div className="h-5 w-28 rounded bg-zinc-100" />
            <div className="mt-4 flex gap-6">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-2.5 w-16 rounded bg-zinc-100" />
                  <div className="h-4 w-20 rounded bg-zinc-100" />
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">Faturado MO</span>
                <span className="rounded-lg bg-zinc-100 p-1.5 text-zinc-400">
                  <TrendingUp size={14} strokeWidth={1.75} />
                </span>
              </div>
              <div className="mt-3 text-2xl font-bold">
                {euro(totals.faturado)}
              </div>
              <div className="mt-1 text-xs text-zinc-400">
                {totals.totalHours.toFixed(2).replace(".", ",")} h registadas
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">Custo MO</span>
                <span className="rounded-lg bg-zinc-100 p-1.5 text-zinc-400">
                  <Users size={14} strokeWidth={1.75} />
                </span>
              </div>
              <div className="mt-3 text-2xl font-bold">
                {euro(totals.custo)}
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">Despesas Fixas</span>
                <span className="rounded-lg bg-zinc-100 p-1.5 text-zinc-400">
                  <Receipt size={14} strokeWidth={1.75} />
                </span>
              </div>
              <div className="mt-3 text-2xl font-bold">
                {euro(totals.despesasFixas)}
              </div>
            </Card>

            <Card>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">Lucro Líquido</span>
                <span className="rounded-lg bg-zinc-100 p-1.5 text-zinc-400">
                  <Landmark size={14} strokeWidth={1.75} />
                </span>
              </div>
              <div
                className={`mt-3 text-2xl font-bold ${
                  isProfitable ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {euro(totals.lucroLiquido)}
              </div>
            </Card>
          </div>

          {/* Status + formula breakdown */}
          <div
            className={`rounded-2xl border p-6 shadow-sm ${
              isProfitable
                ? "border-emerald-200 bg-emerald-50"
                : "border-rose-200 bg-rose-50"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  isProfitable
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-rose-100 text-rose-800"
                }`}
              >
                {isProfitable ? "OFICINA LUCRATIVA" : "OFICINA EM PREJUÍZO"}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-3">
              <div>
                <div className="text-xs text-zinc-500">Faturado MO</div>
                <div className="mt-0.5 text-sm font-semibold text-zinc-800">
                  {euro(totals.faturado)}
                </div>
              </div>
              <span className="pb-0.5 text-sm text-zinc-400">−</span>
              <div>
                <div className="text-xs text-zinc-500">Custo MO</div>
                <div className="mt-0.5 text-sm font-semibold text-zinc-800">
                  {euro(totals.custo)}
                </div>
              </div>
              <span className="pb-0.5 text-sm text-zinc-400">−</span>
              <div>
                <div className="text-xs text-zinc-500">Despesas Fixas</div>
                <div className="mt-0.5 text-sm font-semibold text-zinc-800">
                  {euro(totals.despesasFixas)}
                </div>
              </div>
              <span className="pb-0.5 text-sm text-zinc-400">=</span>
              <div>
                <div className="text-xs text-zinc-500">Lucro Líquido</div>
                <div
                  className={`mt-0.5 text-sm font-bold ${
                    isProfitable ? "text-emerald-700" : "text-rose-700"
                  }`}
                >
                  {euro(totals.lucroLiquido)}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
