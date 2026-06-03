import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Link } from "react-router-dom";
import type { Employee, Service, ServiceStatus, TimeEntry } from "../types";
import { euro } from "../lib/format";
import { todayISO, todayYM, ymFromDateISO } from "../lib/dates";
import {
  buildCostPerHourMap,
  calcCusto,
  calcMargemMO,
  calcTotalHours,
} from "../lib/finance";
import { resolveServiceLaborBilled } from "../lib/analytics";
import { toast } from "../lib/toast";
import { Select } from "../components/ui/Select";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { MonthPicker } from "../components/ui/MonthPicker";
import { DatePicker } from "../components/ui/DatePicker";

const LS_MONTH = "servicos_month";
const LS_CREATE_DATE = "servicos_create_date";

const STATUS_LABELS: Record<ServiceStatus, string> = {
  open: "Aberto",
  completed: "Concluído",
  invoiced: "Faturado",
};

export default function ServicosPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [hourlyRate, setHourlyRate] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);

  const [month, setMonth] = useState<string>(() => {
    return localStorage.getItem(LS_MONTH) || todayYM();
  });

  const [serviceNo, setServiceNo] = useState("");
  const [plate, setPlate] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [serviceDate, setServiceDate] = useState<string>(() => {
    return localStorage.getItem(LS_CREATE_DATE) || todayISO();
  });
  const [laborBilled, setLaborBilled] = useState("");
  const [materialCost, setMaterialCost] = useState("");
  const [materialBilled, setMaterialBilled] = useState("");
  const [status, setStatus] = useState<ServiceStatus>("open");

  useEffect(() => {
    localStorage.setItem(LS_MONTH, month);
  }, [month]);

  useEffect(() => {
    localStorage.setItem(LS_CREATE_DATE, serviceDate);
  }, [serviceDate]);

  async function loadAll() {
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

    const empRes = await supabase
      .from("employees")
      .select("id, monthly_salary, monthly_hours")
      .order("created_at", { ascending: true });

    if (empRes.error) {
      toast.error("Erro ao carregar funcionários.");
      setEmployees([]);
    } else {
      setEmployees((empRes.data ?? []) as Employee[]);
    }

    const svcRes = await supabase
      .from("services")
      .select("*")
      .order("created_at", { ascending: true });

    if (svcRes.error) {
      toast.error("Erro ao carregar serviços.");
      setServices([]);
    } else {
      setServices((svcRes.data ?? []) as Service[]);
    }

    const teRes = await supabase
      .from("time_entries")
      .select("id, service_id, employee_id, hours, entry_date")
      .order("created_at", { ascending: true });

    if (teRes.error) {
      toast.error("Erro ao carregar lançamentos.");
      setTimeEntries([]);
    } else {
      setTimeEntries((teRes.data ?? []) as TimeEntry[]);
    }

    setEpoch((e) => e + 1);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const employeeCostPerHourById = useMemo(
    () => buildCostPerHourMap(employees),
    [employees]
  );

  const timeEntriesByServiceId = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const te of timeEntries) {
      const arr = map.get(te.service_id) ?? [];
      arr.push(te);
      map.set(te.service_id, arr);
    }
    return map;
  }, [timeEntries]);

  const servicesFiltered = useMemo(
    () => services.filter((s) => ymFromDateISO(s.service_date) === month),
    [services, month]
  );

  const rows = useMemo(
    () =>
      servicesFiltered.map((s) => {
        const entries = timeEntriesByServiceId.get(s.id) ?? [];
        const totalHours = calcTotalHours(entries);
        const laborCost = calcCusto(entries, employeeCostPerHourById);
        const resolvedLaborBilled =
          hourlyRate !== null
            ? resolveServiceLaborBilled(s, entries, hourlyRate)
            : null;
        const margem =
          resolvedLaborBilled !== null
            ? calcMargemMO(resolvedLaborBilled, laborCost)
            : null;
        const hasDirectBilling = s.labor_billed !== null && s.labor_billed !== undefined;
        return { service: s, totalHours, laborBilled: resolvedLaborBilled, laborCost, margem, hasDirectBilling };
      }),
    [servicesFiltered, timeEntriesByServiceId, hourlyRate, employeeCostPerHourById]
  );

  const monthSummary = useMemo(() => {
    const totalHours = rows.reduce((s, r) => s + r.totalHours, 0);
    const laborCost = rows.reduce((s, r) => s + r.laborCost, 0);
    const totalLaborBilled =
      hourlyRate !== null
        ? rows.reduce((s, r) => s + (r.laborBilled ?? 0), 0)
        : null;
    const totalMargem =
      hourlyRate !== null
        ? rows.reduce((s, r) => s + (r.margem ?? 0), 0)
        : null;
    return { totalHours, laborBilled: totalLaborBilled, laborCost, margem: totalMargem };
  }, [rows, hourlyRate]);

  async function addService(e: React.FormEvent) {
    e.preventDefault();

    if (!serviceDate) {
      toast.error("Data é obrigatória.");
      return;
    }

    const lb = Number(laborBilled.replace(",", ".")) || null;

    const { error } = await supabase.from("services").insert({
      service_no: serviceNo.trim() || null,
      plate: plate.trim() || null,
      service_type: serviceType.trim() || null,
      service_date: serviceDate,
      notes: null,
      status,
      labor_billed: lb,
      material_cost: Number(materialCost.replace(",", ".")) || 0,
      material_billed: Number(materialBilled.replace(",", ".")) || 0,
    });

    if (error) {
      toast.error("Erro ao criar serviço.");
      return;
    }

    setServiceNo("");
    setPlate("");
    setServiceType("");
    setLaborBilled("");
    setMaterialCost("");
    setMaterialBilled("");
    setStatus("open");
    await loadAll();
  }

  async function updateService(id: string, patch: Partial<Service>) {
    setSavingId(id);
    const { error } = await supabase.from("services").update(patch).eq("id", id);
    setSavingId(null);

    if (error) {
      toast.error("Erro ao atualizar serviço.");
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
      toast.error("Erro ao apagar serviço.");
      return;
    }

    await loadAll();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Serviços"
        subtitle="Contas automáticas por serviço: horas → faturado → custo → margem MO."
        actions={
          <div className="flex items-end gap-3">
            <MonthPicker value={month} onChange={setMonth} />

            <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm">
              <div className="text-xs text-zinc-500">Tarifa/hora</div>
              <div className="text-lg font-bold">
                {hourlyRate !== null ? euro(hourlyRate) : "N/D"}
              </div>
            </div>
          </div>
        }
      />

      {!loading && hourlyRate === null && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Tarifa/hora não configurada.</span>{" "}
          Verifica as Definições antes de continuar.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-sm text-zinc-600">Horas (mês)</div>
          <div className="mt-2 text-2xl font-bold">
            {monthSummary.totalHours.toFixed(2).replace(".", ",")}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-zinc-600">Faturado MO (mês)</div>
          <div className="mt-2 text-2xl font-bold">
            {monthSummary.laborBilled !== null ? euro(monthSummary.laborBilled) : "N/D"}
          </div>
        </Card>
        <Card>
          <div className="text-sm text-zinc-600">Custo MO (mês)</div>
          <div className="mt-2 text-2xl font-bold">{euro(monthSummary.laborCost)}</div>
        </Card>
        <Card>
          <div className="text-sm text-zinc-600">Margem MO (mês)</div>
          <div className="mt-2 text-2xl font-bold">
            {monthSummary.margem !== null ? euro(monthSummary.margem) : "N/D"}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="text-sm font-semibold">Criar serviço</h2>

          <form onSubmit={addService} className="mt-4 space-y-3">
            <div>
              <label className="text-sm font-medium">Data</label>
              <DatePicker
                value={serviceDate}
                onChange={setServiceDate}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Nº Serviço</label>
              <Input
                value={serviceNo}
                onChange={(e) => setServiceNo(e.target.value)}
                placeholder="Opcional"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Matrícula</label>
              <Input
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="Ex: 12-AB-34"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Tipo de serviço</label>
              <Input
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
                placeholder="Ex: Revisão, Travões…"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">MO faturada (€)</label>
              <Input
                value={laborBilled}
                onChange={(e) => setLaborBilled(e.target.value)}
                placeholder="Ex: 62,00 (deixa vazio para calcular por horas)"
                inputMode="decimal"
                className="mt-1"
              />
              <p className="mt-0.5 text-xs text-zinc-500">
                Se preenchido, usa este valor. Caso contrário, calcula pelas horas registadas.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium">Custo materiais (€)</label>
              <Input
                value={materialCost}
                onChange={(e) => setMaterialCost(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Faturado materiais (€)</label>
              <Input
                value={materialBilled}
                onChange={(e) => setMaterialBilled(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Estado</label>
              <Select
                className="mt-1"
                value={status}
                onChange={(v) => setStatus(v as ServiceStatus)}
                options={Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
              />
            </div>

            <Button className="w-full">Criar</Button>
          </form>
        </Card>

        <Card className="lg:col-span-2">
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
            <div className="mt-4 overflow-hidden rounded-xl border">
              <table className="w-full table-auto text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-600">
                  <tr>
                    <th className="px-3 py-2 w-48">Data</th>
                    <th className="px-3 py-2 w-40">Matrícula</th>
                    <th className="px-3 py-2 w-56">Tipo</th>
                    <th className="px-3 py-2 w-20 whitespace-nowrap">Horas</th>
                    <th className="px-3 py-2 w-28 whitespace-nowrap">Faturado MO</th>
                    <th className="px-3 py-2 w-28 whitespace-nowrap">Custo MO</th>
                    <th className="px-3 py-2 w-28 whitespace-nowrap">Margem MO</th>
                    <th className="px-3 py-2 w-32 text-right whitespace-nowrap">Ações</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((r) => {
                    const s = r.service;
                    const busy = savingId === s.id;

                    return (
                      <tr key={`${s.id}-${epoch}`} className="border-t align-top">
                        <td className="px-3 py-2">
                          <DatePicker
                            value={s.service_date}
                            onChange={(v) =>
                              updateService(s.id, { service_date: v })
                            }
                            disabled={busy}
                            size="compact"
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
                          {r.laborBilled !== null ? euro(r.laborBilled) : "N/D"}
                        </td>

                        <td className="px-3 py-2 font-semibold whitespace-nowrap">
                          {euro(r.laborCost)}
                        </td>

                        <td className="px-3 py-2 font-semibold whitespace-nowrap">
                          {r.margem !== null ? euro(r.margem) : "N/D"}
                        </td>

                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <Button
                            variant="secondary"
                            size="sm"
                            className="inline-flex"
                            onClick={() => removeService(s.id)}
                            disabled={busy}
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
          )}
          <div className="mt-3 text-xs text-zinc-500">
            Margem MO = Faturado MO − Custo MO (sem despesas fixas). Clica na matrícula para lançar horas.
          </div>
        </Card>
      </div>
    </div>
  );
}
