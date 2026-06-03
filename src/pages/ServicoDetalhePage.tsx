import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { Employee, Service, TimeEntry } from "../types";
import { euro, parseNumber } from "../lib/format";
import { todayISO } from "../lib/dates";
import { toast } from "../lib/toast";
import { Select } from "../components/ui/Select";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { DatePicker } from "../components/ui/DatePicker";
import {
  buildCostPerHourMap,
  calcCusto,
  calcFaturado,
  calcLucroLiquido,
  calcMargemMO,
  calcTotalHours,
} from "../lib/finance";

export default function ServicoDetalhePage() {
  const { id } = useParams();
  const nav = useNavigate();

  const [service, setService] = useState<Service | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [hourlyRate, setHourlyRate] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);

  const [employeeId, setEmployeeId] = useState("");
  const [entryDate, setEntryDate] = useState(todayISO);
  const [hours, setHours] = useState("");
  const [notes, setNotes] = useState("");

  async function load() {
    if (!id) return;
    setLoading(true);

    const settingsRes = await supabase
      .from("settings")
      .select("hourly_rate")
      .eq("id", 1)
      .maybeSingle();

    if (settingsRes.error) {
      toast.error("Erro ao carregar a tarifa/hora.");
    } else if (settingsRes.data?.hourly_rate != null) {
      setHourlyRate(Number(settingsRes.data.hourly_rate));
    }

    const svcRes = await supabase
      .from("services")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (svcRes.error || !svcRes.data) {
      toast.error("Serviço não encontrado.");
      setService(null);
    } else {
      setService(svcRes.data as Service);
    }

    const empRes = await supabase
      .from("employees")
      .select("id, name, role, monthly_salary, monthly_hours")
      .order("created_at", { ascending: true });

    if (empRes.error) {
      toast.error("Erro ao carregar funcionários.");
      setEmployees([]);
    } else {
      const list = (empRes.data ?? []) as Employee[];
      setEmployees(list);
      if (!employeeId && list.length > 0) {
        setEmployeeId(list[0].id);
      }
    }

    const teRes = await supabase
      .from("time_entries")
      .select("*")
      .eq("service_id", id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (teRes.error) {
      toast.error("Erro ao carregar lançamentos.");
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

  const costPerHourByEmployee = useMemo(
    () => buildCostPerHourMap(employees),
    [employees]
  );

  const totals = useMemo(() => {
    const totalHours = calcTotalHours(entries);
    const laborCost = calcCusto(entries, costPerHourByEmployee);

    if (hourlyRate === null) {
      return { totalHours, laborBilled: null, laborCost, margem: null, lucroLiquido: null };
    }

    const laborBilled = calcFaturado(totalHours, hourlyRate);
    const materialBilled = Number(service?.material_billed) || 0;
    const materialCost = Number(service?.material_cost) || 0;
    const margem = calcMargemMO(laborBilled, laborCost);
    const lucroLiquido = calcLucroLiquido(
      laborBilled,
      laborCost,
      0,
      materialBilled,
      materialCost
    );

    return { totalHours, laborBilled, laborCost, margem, lucroLiquido, materialBilled, materialCost };
  }, [entries, hourlyRate, costPerHourByEmployee, service]);

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;

    if (employees.length === 0) {
      toast.error("Cria primeiro um funcionário.");
      return;
    }
    if (!employeeId) {
      toast.error("Escolhe um funcionário.");
      return;
    }
    if (!entryDate) {
      toast.error("Escolhe uma data.");
      return;
    }

    const h = parseNumber(hours);
    if (h === null || h <= 0) {
      toast.error("Horas inválidas.");
      return;
    }

    const { error } = await supabase.from("time_entries").insert({
      service_id: id,
      employee_id: employeeId,
      entry_date: entryDate,
      hours: h,
      notes: notes.trim() || null,
    });

    if (error) {
      toast.error("Erro ao adicionar horas.");
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
      toast.error("Erro ao apagar lançamento.");
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
        <Button variant="secondary" onClick={() => nav("/servicos")}>
          Voltar
        </Button>
      </div>
    );
  }

  const hasMaterials =
    (Number(service.material_billed) || 0) > 0 ||
    (Number(service.material_cost) || 0) > 0;

  return (
    <div className="space-y-6">
      {hourlyRate === null && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Tarifa/hora não configurada.</span>{" "}
          Verifica as Definições antes de continuar.
        </div>
      )}

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

        <Button variant="secondary" onClick={() => nav("/servicos")}>
          Voltar aos serviços
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-sm text-zinc-600">Horas MO</div>
          <div className="mt-2 text-2xl font-bold">
            {totals.totalHours.toFixed(2).replace(".", ",")}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-zinc-600">Faturado MO</div>
          <div className="mt-2 text-2xl font-bold">
            {totals.laborBilled !== null ? euro(totals.laborBilled) : "N/D"}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-zinc-600">Custo MO</div>
          <div className="mt-2 text-2xl font-bold">{euro(totals.laborCost)}</div>
        </Card>
        <Card>
          <div className="text-sm text-zinc-600">Margem MO</div>
          <div className="mt-2 text-2xl font-bold">
            {totals.margem !== null ? euro(totals.margem) : "N/D"}
          </div>
        </Card>
      </div>

      {hasMaterials && (
        <Card>
          <div className="text-sm font-semibold">Materiais</div>
          <div className="mt-3 flex flex-wrap gap-6">
            <div>
              <div className="text-xs text-zinc-500">Custo materiais</div>
              <div className="text-lg font-bold">
                {euro(Number(service.material_cost) || 0)}
              </div>
            </div>
            <div>
              <div className="text-xs text-zinc-500">Faturado materiais</div>
              <div className="text-lg font-bold">
                {euro(Number(service.material_billed) || 0)}
              </div>
            </div>
            {totals.lucroLiquido !== null && (
              <div>
                <div className="text-xs text-zinc-500">Lucro total (MO + mat.)</div>
                <div
                  className={`text-lg font-bold ${
                    totals.lucroLiquido >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {euro(totals.lucroLiquido)}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="text-sm font-semibold">Adicionar horas</h2>

          {employees.length === 0 && (
            <div className="mt-4 rounded-xl border bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              Ainda não tens funcionários. Vai a{" "}
              <span className="font-semibold">Funcionários</span> e cria pelo menos 1.
            </div>
          )}

          <form onSubmit={addEntry} className="mt-4 space-y-3">
            <div>
              <label className="text-sm font-medium">Funcionário</label>
              <Select
                className="mt-1"
                value={employeeId}
                onChange={setEmployeeId}
                disabled={employees.length === 0}
                placeholder="Selecionar funcionário…"
                options={employees.map((e) => ({
                  value: e.id,
                  label: e.role ? `${e.name} (${e.role})` : e.name,
                }))}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Data</label>
              <DatePicker
                value={entryDate}
                onChange={setEntryDate}
                disabled={employees.length === 0}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Horas</label>
              <Input
                className="mt-1"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="Ex: 2,5"
                inputMode="decimal"
                disabled={employees.length === 0}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Notas (opcional)</label>
              <Input
                className="mt-1"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Travões frente"
                disabled={employees.length === 0}
              />
            </div>

            <Button disabled={employees.length === 0} className="w-full">
              Adicionar
            </Button>
          </form>
        </Card>

        <Card className="lg:col-span-2">
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
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => removeEntry(x.id)}
                            >
                              Apagar
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
