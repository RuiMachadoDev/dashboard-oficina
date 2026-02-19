import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Employee = {
  id: string;
  name?: string | null;
  role?: string | null;
  monthly_salary: number;
  monthly_hours: number;
  created_at?: string;
};

type Service = {
  id: string;
  service_type: string | null;
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
  return String(dateISO).slice(0, 7);
}

function addMonths(ym: string, delta: number) {
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + delta);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

export default function RelatoriosPage() {
  const [month, setMonth] = useState(todayYM());

  const [hourlyRate, setHourlyRate] = useState<number>(31);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);

  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
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
        .select("id, name, role, monthly_salary, monthly_hours, created_at")
        .order("created_at", { ascending: true });

      if (empRes.error) {
        console.error("load employees failed:", empRes.error);
        setEmployees([]);
      } else {
        setEmployees((empRes.data ?? []) as Employee[]);
      }

      const svcRes = await supabase
        .from("services")
        .select("id, service_type, service_date")
        .order("service_date", { ascending: false });

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
        .select("id, name, amount_monthly")
        .order("created_at", { ascending: true });

      if (fxRes.error) {
        console.error("load fixed_expenses failed:", fxRes.error);
        setFixedExpenses([]);
      } else {
        setFixedExpenses((fxRes.data ?? []) as FixedExpense[]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ch = supabase
      .channel("reports_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_entries" },
        () => loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "services" },
        () => loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "employees" },
        () => loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "fixed_expenses" },
        () => loadAll()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "settings" },
        () => loadAll()
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

  const serviceById = useMemo(() => {
    const m = new Map<string, Service>();
    for (const s of services) m.set(s.id, s);
    return m;
  }, [services]);

  const monthServiceIds = useMemo(() => {
    return new Set(
      services
        .filter((s) => ymFromDateISO(s.service_date) === month)
        .map((s) => s.id)
    );
  }, [services, month]);

  const monthEntries = useMemo(() => {
    return timeEntries.filter((te) => monthServiceIds.has(te.service_id));
  }, [timeEntries, monthServiceIds]);

  const fixedMonthlyTotal = useMemo(() => {
    return fixedExpenses.reduce(
      (sum, x) => sum + (Number(x.amount_monthly) || 0),
      0
    );
  }, [fixedExpenses]);

  const monthTotals = useMemo(() => {
    const totalHours = monthEntries.reduce((s, x) => s + (Number(x.hours) || 0), 0);
    const faturado = totalHours * hourlyRate;

    const custo = monthEntries.reduce((s, x) => {
      const cph = employeeCostPerHourById.get(x.employee_id) ?? 0;
      return s + (Number(x.hours) || 0) * cph;
    }, 0);

    const despesasFixas = fixedMonthlyTotal;
    const lucroLiquido = faturado - custo - despesasFixas;

    return { totalHours, faturado, custo, despesasFixas, lucroLiquido };
  }, [monthEntries, hourlyRate, employeeCostPerHourById, fixedMonthlyTotal]);

  const lucroPorFuncionario = useMemo(() => {
    const byEmp = new Map<
      string,
      { employeeId: string; hours: number; faturado: number; custo: number; lucro: number }
    >();

    for (const te of monthEntries) {
      const hours = Number(te.hours) || 0;
      const faturado = hours * hourlyRate;
      const cph = employeeCostPerHourById.get(te.employee_id) ?? 0;
      const custo = hours * cph;

      const prev =
        byEmp.get(te.employee_id) ?? {
          employeeId: te.employee_id,
          hours: 0,
          faturado: 0,
          custo: 0,
          lucro: 0,
        };

      prev.hours += hours;
      prev.faturado += faturado;
      prev.custo += custo;
      prev.lucro += faturado - custo;

      byEmp.set(te.employee_id, prev);
    }

    const arr = Array.from(byEmp.values()).map((x) => {
      const emp = employees.find((e) => e.id === x.employeeId);
      return {
        ...x,
        name: emp?.name ?? "—",
        role: emp?.role ?? "",
      };
    });

    arr.sort((a, b) => b.lucro - a.lucro);
    return arr;
  }, [monthEntries, hourlyRate, employeeCostPerHourById, employees]);

  const topTiposServico = useMemo(() => {
    const byType = new Map<string, { type: string; count: number; hours: number }>();

    for (const te of monthEntries) {
      const svc = serviceById.get(te.service_id);
      const type = (svc?.service_type ?? "Sem tipo").trim() || "Sem tipo";
      const hours = Number(te.hours) || 0;

      const prev = byType.get(type) ?? { type, count: 0, hours: 0 };
      prev.hours += hours;
      byType.set(type, prev);
    }

    for (const s of services.filter((x) => ymFromDateISO(x.service_date) === month)) {
      const type = (s.service_type ?? "Sem tipo").trim() || "Sem tipo";
      const prev = byType.get(type) ?? { type, count: 0, hours: 0 };
      prev.count += 1;
      byType.set(type, prev);
    }

    const arr = Array.from(byType.values());
    arr.sort((a, b) => b.count - a.count || b.hours - a.hours);
    return arr.slice(0, 10);
  }, [monthEntries, services, month, serviceById]);

  const evolucao6Meses = useMemo(() => {
    const months = [0, -1, -2, -3, -4, -5].map((d) => addMonths(month, d)).reverse();

    const rows = months.map((ym) => {
      const serviceIds = new Set(
        services.filter((s) => ymFromDateISO(s.service_date) === ym).map((s) => s.id)
      );
      const entries = timeEntries.filter((te) => serviceIds.has(te.service_id));

      const totalHours = entries.reduce((s, x) => s + (Number(x.hours) || 0), 0);
      const faturado = totalHours * hourlyRate;

      const custo = entries.reduce((s, x) => {
        const cph = employeeCostPerHourById.get(x.employee_id) ?? 0;
        return s + (Number(x.hours) || 0) * cph;
      }, 0);

      const despesasFixas = fixedMonthlyTotal;
      const lucroLiquido = faturado - custo - despesasFixas;

      return { ym, faturado, custo, despesasFixas, lucroLiquido };
    });

    return rows;
  }, [month, services, timeEntries, hourlyRate, employeeCostPerHourById, fixedMonthlyTotal]);

  const isProfitable = monthTotals.lucroLiquido >= 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Análise mensal (mão-de-obra + despesas fixas).
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
              <div className="mt-2 text-2xl font-bold">{euro(monthTotals.faturado)}</div>
              <div className="mt-1 text-xs text-zinc-500">
                Horas: {monthTotals.totalHours.toFixed(2).replace(".", ",")}
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm text-zinc-600">Custo MO</div>
              <div className="mt-2 text-2xl font-bold">{euro(monthTotals.custo)}</div>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm text-zinc-600">Despesas Fixas</div>
              <div className="mt-2 text-2xl font-bold">{euro(monthTotals.despesasFixas)}</div>
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm text-zinc-600">Lucro Líquido</div>
              <div className="mt-2 text-2xl font-bold">{euro(monthTotals.lucroLiquido)}</div>
              <div
                className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                  isProfitable
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-rose-100 text-rose-800"
                }`}
              >
                {isProfitable ? "LUCRATIVO" : "PREJUÍZO"}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Lucro por funcionário (mês)</h2>
              </div>

              {lucroPorFuncionario.length === 0 ? (
                <div className="mt-4 text-sm text-zinc-600">Sem lançamentos neste mês.</div>
              ) : (
                <div className="mt-4 overflow-hidden rounded-xl border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-xs text-zinc-600">
                      <tr>
                        <th className="px-3 py-2">Funcionário</th>
                        <th className="px-3 py-2">Horas</th>
                        <th className="px-3 py-2">Faturado</th>
                        <th className="px-3 py-2">Custo</th>
                        <th className="px-3 py-2">Lucro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lucroPorFuncionario.map((r) => (
                        <tr key={r.employeeId} className="border-t">
                          <td className="px-3 py-2">
                            <div className="font-semibold">{r.name}</div>
                            <div className="text-xs text-zinc-500">{r.role}</div>
                          </td>
                          <td className="px-3 py-2 font-semibold">
                            {r.hours.toFixed(2).replace(".", ",")}
                          </td>
                          <td className="px-3 py-2 font-semibold">{euro(r.faturado)}</td>
                          <td className="px-3 py-2 font-semibold">{euro(r.custo)}</td>
                          <td className="px-3 py-2 font-semibold">{euro(r.lucro)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold">Serviços mais procurados (mês)</h2>

              {topTiposServico.length === 0 ? (
                <div className="mt-4 text-sm text-zinc-600">Sem serviços neste mês.</div>
              ) : (
                <div className="mt-4 overflow-hidden rounded-xl border">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 text-xs text-zinc-600">
                      <tr>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2">Nº serviços</th>
                        <th className="px-3 py-2">Horas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topTiposServico.map((r) => (
                        <tr key={r.type} className="border-t">
                          <td className="px-3 py-2 font-semibold">{r.type}</td>
                          <td className="px-3 py-2 font-semibold">{r.count}</td>
                          <td className="px-3 py-2 font-semibold">
                            {r.hours.toFixed(2).replace(".", ",")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold">Evolução (últimos 6 meses)</h2>

            <div className="mt-4 overflow-hidden rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-600">
                  <tr>
                    <th className="px-3 py-2">Mês</th>
                    <th className="px-3 py-2">Faturado</th>
                    <th className="px-3 py-2">Custo</th>
                    <th className="px-3 py-2">Despesas</th>
                    <th className="px-3 py-2">Lucro Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {evolucao6Meses.map((r) => (
                    <tr key={r.ym} className="border-t">
                      <td className="px-3 py-2 font-semibold">{r.ym}</td>
                      <td className="px-3 py-2 font-semibold">{euro(r.faturado)}</td>
                      <td className="px-3 py-2 font-semibold">{euro(r.custo)}</td>
                      <td className="px-3 py-2 font-semibold">{euro(r.despesasFixas)}</td>
                      <td className="px-3 py-2 font-semibold">{euro(r.lucroLiquido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-xs text-zinc-500">
              Nota: despesas fixas consideradas iguais em todos os meses (valor atual em Despesas Fixas).
            </div>
          </div>
        </>
      )}
    </div>
  );
}
