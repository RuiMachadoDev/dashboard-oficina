import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Employee = {
  id: string;
  monthly_salary: number;
  monthly_hours: number;
};

type Service = {
  id: string;
  service_date: string;
};

type TimeEntry = {
  id: string;
  service_id: string;
  employee_id: string;
  hours: number;
  entry_date: string;
};

type FixedExpense = {
  id: string;
  name: string;
  amount_monthly: number;
};

function euro(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `€ ${v.toFixed(2).replace(".", ",")}`;
}

function todayYM() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function ymFromDateISO(dateISO: string) {
  return dateISO.slice(0, 7);
}

export default function DashboardPage() {
  const [month, setMonth] = useState(todayYM());

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

  const employeeCostPerHourById = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of employees) {
      const mh = Number(e.monthly_hours) || 0;
      const ms = Number(e.monthly_salary) || 0;
      map.set(e.id, mh > 0 ? ms / mh : 0);
    }
    return map;
  }, [employees]);

  const monthServiceIds = useMemo(() => {
    return new Set(
      services
        .filter((s) => ymFromDateISO(String(s.service_date)) === month)
        .map((s) => s.id)
    );
  }, [services, month]);

  const monthEntries = useMemo(() => {
    return timeEntries.filter((te) => monthServiceIds.has(te.service_id));
  }, [timeEntries, monthServiceIds]);

  const totals = useMemo(() => {
    const totalHours = monthEntries.reduce(
      (s, x) => s + (Number(x.hours) || 0),
      0
    );

    const faturado = totalHours * hourlyRate;

    const custo = monthEntries.reduce((s, x) => {
      const cph = employeeCostPerHourById.get(x.employee_id) ?? 0;
      return s + (Number(x.hours) || 0) * cph;
    }, 0);

    const despesasFixas = fixedExpenses.reduce(
      (s, x) => s + (Number(x.amount_monthly) || 0),
      0
    );

    const lucroLiquido = faturado - custo - despesasFixas;

    return { totalHours, faturado, custo, despesasFixas, lucroLiquido };
  }, [monthEntries, hourlyRate, employeeCostPerHourById, fixedExpenses]);

  const isProfitable = totals.lucroLiquido >= 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Visão mensal (mão-de-obra + despesas fixas).
          </p>
        </div>

        <div className="flex items-end gap-3">
          <div>
            <label className="text-xs font-semibold text-zinc-600">Mês</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-1 rounded-xl border bg-white px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm">
            <div className="text-xs text-zinc-500">Tarifa/hora</div>
            <div className="text-lg font-bold">{euro(hourlyRate)}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-600">A carregar…</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm text-zinc-600">Faturado MO</div>
              <div className="mt-2 text-2xl font-bold">
                {euro(totals.faturado)}
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm text-zinc-600">Custo MO</div>
              <div className="mt-2 text-2xl font-bold">{euro(totals.custo)}</div>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm text-zinc-600">Despesas Fixas</div>
              <div className="mt-2 text-2xl font-bold">
                {euro(totals.despesasFixas)}
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm text-zinc-600">Lucro Líquido</div>
              <div className="mt-2 text-2xl font-bold">
                {euro(totals.lucroLiquido)}
              </div>
            </div>
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
