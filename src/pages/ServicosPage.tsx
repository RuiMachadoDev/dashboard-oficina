import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Link } from "react-router-dom";

type Service = {
  id: string;
  service_no: string | null;
  plate: string | null;
  service_type: string | null;
  service_date: string;
  notes: string | null;
  created_at: string;
};

type Employee = {
  id: string;
  monthly_salary: number;
  monthly_hours: number;
};

type TimeEntry = {
  id: string;
  service_id: string;
  employee_id: string;
  hours: number;
  entry_date: string;
};

function euro(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `€ ${v.toFixed(2).replace(".", ",")}`;
}

function ymFromDateISO(dateISO: string) {
  return dateISO.slice(0, 7);
}

function todayYM() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function ServicosPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [hourlyRate, setHourlyRate] = useState<number>(31);

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [month, setMonth] = useState<string>(todayYM());

  const [serviceNo, setServiceNo] = useState("");
  const [plate, setPlate] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [serviceDate, setServiceDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });

  async function loadAll() {
    setLoading(true);

    const settingsRes = await supabase
      .from("settings")
      .select("hourly_rate")
      .eq("id", 1)
      .maybeSingle();

    if (!settingsRes.error && settingsRes.data?.hourly_rate != null) {
      setHourlyRate(Number(settingsRes.data.hourly_rate));
    }

    const empRes = await supabase
      .from("employees")
      .select("id, monthly_salary, monthly_hours")
      .order("created_at", { ascending: true });

    if (empRes.error) {
      console.error("load employees failed:", empRes.error);
      setEmployees([]);
    } else {
      setEmployees((empRes.data ?? []) as Employee[]);
    }

    const svcRes = await supabase
      .from("services")
      .select("*")
      .order("service_date", { ascending: false });

    if (svcRes.error) {
      console.error("load services failed:", svcRes.error);
      setServices([]);
    } else {
      setServices((svcRes.data ?? []) as Service[]);
    }

    const teRes = await supabase
      .from("time_entries")
      .select("id, service_id, employee_id, hours, entry_date")
      .order("created_at", { ascending: true });

    if (teRes.error) {
      console.error("load time_entries failed:", teRes.error);
      setTimeEntries([]);
    } else {
      setTimeEntries((teRes.data ?? []) as TimeEntry[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  const employeeCostPerHourById = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of employees) {
      const mh = Number(e.monthly_hours) || 0;
      const ms = Number(e.monthly_salary) || 0;
      const cph = mh > 0 ? ms / mh : 0;
      map.set(e.id, cph);
    }
    return map;
  }, [employees]);

  const timeEntriesByServiceId = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const te of timeEntries) {
      const arr = map.get(te.service_id) ?? [];
      arr.push(te);
      map.set(te.service_id, arr);
    }
    return map;
  }, [timeEntries]);

  const servicesFiltered = useMemo(() => {
    return services.filter((s) => ymFromDateISO(s.service_date) === month);
  }, [services, month]);

  const rows = useMemo(() => {
    return servicesFiltered.map((s) => {
      const entries = timeEntriesByServiceId.get(s.id) ?? [];

      const totalHours = entries.reduce((sum, x) => sum + (Number(x.hours) || 0), 0);

      const faturado = totalHours * hourlyRate;

      const custo = entries.reduce((sum, x) => {
        const hours = Number(x.hours) || 0;
        const cph = employeeCostPerHourById.get(x.employee_id) ?? 0;
        return sum + hours * cph;
      }, 0);

      const lucro = faturado - custo;

      return { service: s, totalHours, faturado, custo, lucro };
    });
  }, [servicesFiltered, timeEntriesByServiceId, hourlyRate, employeeCostPerHourById]);

  const monthSummary = useMemo(() => {
    const totalHours = rows.reduce((s, r) => s + r.totalHours, 0);
    const faturado = rows.reduce((s, r) => s + r.faturado, 0);
    const custo = rows.reduce((s, r) => s + r.custo, 0);
    const lucro = rows.reduce((s, r) => s + r.lucro, 0);
    return { totalHours, faturado, custo, lucro };
  }, [rows]);

  async function addService(e: React.FormEvent) {
    e.preventDefault();

    if (!serviceDate) return alert("Data é obrigatória.");

    const { error } = await supabase.from("services").insert({
      service_no: serviceNo.trim() || null,
      plate: plate.trim() || null,
      service_type: serviceType.trim() || null,
      service_date: serviceDate,
      notes: null,
    });

    if (error) {
      console.error("insert service failed:", error);
      alert("Erro ao criar serviço.");
      return;
    }

    setServiceNo("");
    setPlate("");
    setServiceType("");
    await loadAll();
  }

  async function updateService(id: string, patch: Partial<Service>) {
    setSavingId(id);
    const { error } = await supabase.from("services").update(patch).eq("id", id);
    setSavingId(null);

    if (error) {
      console.error("update service failed:", error);
      alert("Erro ao atualizar serviço.");
      return;
    }

    await loadAll();
  }

  async function removeService(id: string) {
    if (!confirm("Apagar este serviço?")) return;

    setSavingId(id);
    const { error } = await supabase.from("services").delete().eq("id", id);
    setSavingId(null);

    if (error) {
      console.error("delete service failed:", error);
      alert("Erro ao apagar serviço.");
      return;
    }

    await loadAll();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Serviços</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Contas automáticas por serviço: horas → faturado → custo → lucro (mão-de-obra).
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-zinc-600">Horas (mês)</div>
          <div className="mt-2 text-2xl font-bold">{monthSummary.totalHours.toFixed(2).replace(".", ",")}</div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-zinc-600">Faturado MO (mês)</div>
          <div className="mt-2 text-2xl font-bold">{euro(monthSummary.faturado)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-zinc-600">Custo MO (mês)</div>
          <div className="mt-2 text-2xl font-bold">{euro(monthSummary.custo)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-zinc-600">Lucro MO (mês)</div>
          <div className="mt-2 text-2xl font-bold">{euro(monthSummary.lucro)}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Criar serviço</h2>

          <form onSubmit={addService} className="mt-4 space-y-3">
            <div>
              <label className="text-sm font-medium">Data</label>
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Nº Serviço</label>
              <input
                value={serviceNo}
                onChange={(e) => setServiceNo(e.target.value)}
                placeholder="Opcional"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Matrícula</label>
              <input
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="Ex: 12-AB-34"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Tipo de serviço</label>
              <input
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                placeholder="Ex: Revisão, Travões, Pintura…"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              />
            </div>

            <button className="w-full rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
              Criar
            </button>
          </form>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Serviços do mês</h2>
            <button
              onClick={loadAll}
              className="rounded-xl border bg-white px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
            >
              Atualizar
            </button>
          </div>

          {loading ? (
            <div className="mt-4 text-sm text-zinc-600">A carregar…</div>
          ) : rows.length === 0 ? (
            <div className="mt-4 text-sm text-zinc-600">
              Não há serviços neste mês.
            </div>
          ) : (
            <div className="mt-4 rounded-xl border overflow-hidden">
              <table className="w-full table-auto text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-600">
                  <tr>
                    <th className="px-3 py-2 w-48">Data</th>
                    <th className="px-3 py-2 w-40">Matrícula</th>
                    <th className="px-3 py-2 w-64">Tipo</th>
                    <th className="px-3 py-2 w-20 whitespace-nowrap">Horas</th>
                    <th className="px-3 py-2 w-28 whitespace-nowrap">Faturado</th>
                    <th className="px-3 py-2 w-28 whitespace-nowrap">Custo</th>
                    <th className="px-3 py-2 w-28 whitespace-nowrap">Lucro</th>
                    <th className="px-3 py-2 w-32 text-right whitespace-nowrap">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((r) => {
                      const s = r.service;
                      const busy = savingId === s.id;

                      return (
                        <tr key={s.id} className="border-t align-top">
                          <td className="px-3 py-2">
                            <input
                              type="date"
                              className="w-full rounded-lg border px-2 py-1 text-xs"
                              defaultValue={s.service_date}
                              disabled={busy}
                              onBlur={(e) => updateService(s.id, { service_date: e.target.value })}
                            />
                            <div className="mt-1 text-[11px] text-zinc-500">
                              Nº:{" "}
                              <input
                                className="w-28 rounded border px-1 py-0.5 text-[11px]"
                                defaultValue={s.service_no ?? ""}
                                disabled={busy}
                                onBlur={(e) =>
                                  updateService(s.id, {
                                    service_no: e.target.value.trim() || null,
                                  })
                                }
                              />
                            </div>
                          </td>

                          <td className="px-3 py-2">
                            <Link
                              to={`/servicos/${s.id}`}
                              className="block w-full rounded-lg border px-2 py-1 text-xs font-semibold hover:bg-zinc-50"
                              title={s.plate ?? ""}
                            >
                              {s.plate ?? "Sem matrícula"}
                            </Link>
                          </td>

                          <td className="px-3 py-2">
                            <input
                              className="w-full rounded-lg border px-2 py-1 text-xs"
                              defaultValue={s.service_type ?? ""}
                              disabled={busy}
                              onBlur={(e) =>
                                updateService(s.id, {
                                  service_type: e.target.value.trim() || null,
                                })
                              }
                            />
                          </td>

                          <td className="px-3 py-2 font-semibold whitespace-nowrap">
                            {r.totalHours.toFixed(2).replace(".", ",")}
                          </td>

                          <td className="px-3 py-2 font-semibold whitespace-nowrap">
                            {euro(r.faturado)}
                          </td>

                          <td className="px-3 py-2 font-semibold whitespace-nowrap">
                            {euro(r.custo)}
                          </td>

                          <td className="px-3 py-2 font-semibold whitespace-nowrap">
                            {euro(r.lucro)}
                          </td>

                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <button
                              onClick={() => removeService(s.id)}
                              disabled={busy}
                              className="inline-flex rounded-lg border px-2 py-1 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60"
                            >
                              Apagar
                            </button>
                          </td>
                        </tr>
                      );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 text-xs text-zinc-500">
            Nota: as colunas Horas/Faturado/Custo/Lucro usam lançamentos em{" "}
            <span className="font-semibold">time_entries</span>. A seguir vamos criar a UI
            para registar horas por serviço (igual ao Excel).
          </div>
        </div>
      </div>
    </div>
  );
}
