import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Employee, FixedExpense, Service, TimeEntry } from "../types";
import { euro } from "../lib/format";
import { todayYM } from "../lib/dates";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
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
        subtitle="Visão mensal (mão-de-obra + despesas fixas)."
        actions={
          <div className="flex items-end gap-3">
            <div>
              <label className="text-xs font-semibold text-zinc-600">Mês</label>
              <input
                type="month"
                value={month}
                onChange={(e) => onMonthChange(e.target.value)}
                className="mt-1 rounded-xl border bg-white px-3 py-2 text-sm"
              />
            </div>

            <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm">
              <div className="text-xs text-zinc-500">Tarifa/hora</div>
              <div className="text-lg font-bold">{euro(hourlyRate)}</div>
            </div>
          </div>
        }
      />

      {loading ? (
        <div className="text-sm text-zinc-600">A carregar…</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <div className="text-sm text-zinc-600">Faturado MO</div>
              <div className="mt-2 text-2xl font-bold">{euro(totals.faturado)}</div>
            </Card>

            <Card>
              <div className="text-sm text-zinc-600">Custo MO</div>
              <div className="mt-2 text-2xl font-bold">{euro(totals.custo)}</div>
            </Card>

            <Card>
              <div className="text-sm text-zinc-600">Despesas Fixas</div>
              <div className="mt-2 text-2xl font-bold">{euro(totals.despesasFixas)}</div>
            </Card>

            <Card>
              <div className="text-sm text-zinc-600">Lucro Líquido</div>
              <div className="mt-2 text-2xl font-bold">{euro(totals.lucroLiquido)}</div>
            </Card>
          </div>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="text-sm font-semibold">Estado da Oficina</div>

            <div
              className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                isProfitable
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-rose-100 text-rose-800"
              }`}
            >
              {isProfitable ? "OFICINA LUCRATIVA" : "OFICINA EM PREJUÍZO"}
            </div>

            <div className="mt-3 text-xs text-zinc-500">
              Nota: Lucro Líquido = Faturado MO − Custo MO − Despesas Fixas.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
