import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Service = {
  id: string;
  service_no: string | null;
  plate: string | null;
  service_type: string | null;
  service_date: string;
};

type Employee = {
  id: string;
  name: string;
  role: string;
  monthly_salary: number;
  monthly_hours: number;
};

type TimeEntry = {
  id: string;
  service_id: string;
  employee_id: string;
  entry_date: string;
  hours: number;
  notes: string | null;
  created_at: string;
};

function euro(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `€ ${v.toFixed(2).replace(".", ",")}`;
}

function parseNumber(v: string) {
  const parsed = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export default function ServicoDetalhePage() {
  const { id } = useParams();
  const nav = useNavigate();

  const [service, setService] = useState<Service | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [hourlyRate, setHourlyRate] = useState<number>(31);

  const [loading, setLoading] = useState(true);

  const [employeeId, setEmployeeId] = useState("");
  const [entryDate, setEntryDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");

  async function load() {
    if (!id) return;
    setLoading(true);

    // settings (tarifa/hora)
    const settingsRes = await supabase
      .from("settings")
      .select("hourly_rate")
      .eq("id", 1)
      .maybeSingle();

    if (!settingsRes.error && settingsRes.data?.hourly_rate != null) {
      setHourlyRate(Number(settingsRes.data.hourly_rate));
    }

    // service
    const svcRes = await supabase
      .from("services")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (svcRes.error || !svcRes.data) {
      console.error("load service failed:", svcRes.error);
      setService(null);
    } else {
      setService(svcRes.data as Service);
    }

    // employees
    const empRes = await supabase
      .from("employees")
      .select("id, name, role, monthly_salary, monthly_hours")
      .order("created_at", { ascending: true });

    if (empRes.error) {
      console.error("load employees failed:", empRes.error);
      setEmployees([]);
    } else {
      const list = (empRes.data ?? []) as Employee[];
      setEmployees(list);

      // set default selected employee (only if empty)
      if (!employeeId && list.length > 0) {
        setEmployeeId(list[0].id);
      }
    }

    // time entries
    const teRes = await supabase
      .from("time_entries")
      .select("*")
      .eq("service_id", id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (teRes.error) {
      console.error("load time_entries failed:", teRes.error);
      setEntries([]);
    } else {
      setEntries((teRes.data ?? []) as TimeEntry[]);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const costPerHourByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of employees) {
      const mh = Number(e.monthly_hours) || 0;
      const ms = Number(e.monthly_salary) || 0;
      map.set(e.id, mh > 0 ? ms / mh : 0);
    }
    return map;
  }, [employees]);

  const totals = useMemo(() => {
    const totalHours = entries.reduce((s, x) => s + (Number(x.hours) || 0), 0);
    const faturado = totalHours * hourlyRate;
    const custo = entries.reduce((s, x) => {
      const cph = costPerHourByEmployee.get(x.employee_id) ?? 0;
      return s + (Number(x.hours) || 0) * cph;
    }, 0);
    return { totalHours, faturado, custo, lucro: faturado - custo };
  }, [entries, hourlyRate, costPerHourByEmployee]);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;

    if (employees.length === 0) {
      alert("Cria primeiro um funcionário.");
      return;
    }

    if (!employeeId) return alert("Escolhe um funcionário.");
    if (!entryDate) return alert("Escolhe uma data.");

    const h = parseNumber(hours);
    if (h === null || h <= 0) return alert("Horas inválidas.");

    const { error } = await supabase.from("time_entries").insert({
      service_id: id,
      employee_id: employeeId,
      entry_date: entryDate,
      hours: h,
      notes: notes.trim() || null,
    });

    if (error) {
      console.error("insert time_entry failed:", error);
      alert("Erro ao adicionar horas.");
      return;
    }

    setHours("");
    setNotes("");
    await load();
  }

  async function removeEntry(entryIdToDelete: string) {
    if (!confirm("Apagar este lançamento?")) return;

    const { error } = await supabase
      .from("time_entries")
      .delete()
      .eq("id", entryIdToDelete);

    if (error) {
      console.error("delete time_entry failed:", error);
      alert("Erro ao apagar lançamento.");
      return;
    }

    await load();
  }

  if (loading) {
    return <div className="text-sm text-zinc-600">A carregar…</div>;
  }

  if (!service) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-zinc-600">Serviço não encontrado.</div>
        <button
          onClick={() => nav("/servicos")}
          className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-sm text-zinc-500">Serviço</div>
          <h1 className="text-2xl font-bold">
            {service.plate ?? "Sem matrícula"}{" "}
            <span className="text-zinc-400">•</span>{" "}
            {service.service_type ?? "Sem tipo"}
          </h1>
          <div className="mt-1 text-sm text-zinc-600">
            Data: {service.service_date}{" "}
            {service.service_no ? `• Nº ${service.service_no}` : ""}
          </div>
        </div>

        <button
          onClick={() => nav("/servicos")}
          className="rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50"
        >
          Voltar aos serviços
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-zinc-600">Horas</div>
          <div className="mt-2 text-2xl font-bold">
            {totals.totalHours.toFixed(2).replace(".", ",")}
          </div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-zinc-600">Faturado MO</div>
          <div className="mt-2 text-2xl font-bold">{euro(totals.faturado)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-zinc-600">Custo MO</div>
          <div className="mt-2 text-2xl font-bold">{euro(totals.custo)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-sm text-zinc-600">Lucro MO</div>
          <div className="mt-2 text-2xl font-bold">{euro(totals.lucro)}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Adicionar horas</h2>

          {employees.length === 0 ? (
            <div className="mt-4 rounded-xl border bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              Ainda não tens funcionários. Vai a{" "}
              <span className="font-semibold">Funcionários</span> e cria pelo menos 1
              para poderes registar horas.
            </div>
          ) : null}

          <form onSubmit={addEntry} className="mt-4 space-y-3">
            <div>
              <label className="text-sm font-medium">Funcionário</label>
              <select
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                disabled={employees.length === 0}
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Data</label>
              <input
                type="date"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                disabled={employees.length === 0}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Horas</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="Ex: 2,5"
                inputMode="decimal"
                disabled={employees.length === 0}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Notas (opcional)</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Travões frente"
                disabled={employees.length === 0}
              />
            </div>

            <button
              disabled={employees.length === 0}
              className="w-full rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              Adicionar
            </button>
          </form>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold">Lançamentos</h2>

          {entries.length === 0 ? (
            <div className="mt-4 text-sm text-zinc-600">Ainda não há lançamentos.</div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border">
              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-max table-fixed text-left text-sm">
                  <thead className="bg-zinc-50 text-xs text-zinc-600">
                    <tr>
                        <th className="px-3 py-2 w-32">Data</th>
                        <th className="px-3 py-2 w-64">Funcionário</th>
                        <th className="px-3 py-2 w-24">Horas</th>
                        <th className="px-3 py-2 w-64">Notas</th>
                        <th className="px-3 py-2 w-24 text-right">Ações</th>
                    </tr>
                  </thead>

                  <tbody>
                    {entries.map((x) => {
                      const emp = employees.find((e) => e.id === x.employee_id);
                      return (
                        <tr key={x.id} className="border-t">
                          <td className="px-3 py-2">{x.entry_date}</td>
                          <td className="px-3 py-2">
                            {emp ? `${emp.name} (${emp.role})` : x.employee_id}
                          </td>
                          <td className="px-3 py-2 font-semibold">
                            {Number(x.hours).toFixed(2).replace(".", ",")}
                          </td>
                          <td className="px-3 py-2">{x.notes ?? ""}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => removeEntry(x.id)}
                              className="rounded-lg border px-2 py-1 text-xs font-semibold hover:bg-zinc-50"
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
