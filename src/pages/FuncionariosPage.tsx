import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Employee } from "../types";
import { euro, parseNumber } from "../lib/format";
import { todayISO } from "../lib/dates";
import { toast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { AlertDialog } from "../components/ui/AlertDialog";
import { PageHeader } from "../components/ui/PageHeader";

async function insertSalaryHistory(
  employeeId: string,
  monthly_salary: number,
  monthly_hours: number
) {
  const { error } = await supabase.from("employee_salary_history").insert({
    employee_id: employeeId,
    monthly_salary,
    monthly_hours,
    valid_from: todayISO(),
  });
  if (error) {
    console.error("salary history insert failed (non-fatal):", error);
  }
}

export default function FuncionariosPage() {
  const [items, setItems] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [salary, setSalary] = useState("");
  const [hours, setHours] = useState("160");

  const totalSalary = useMemo(
    () => items.reduce((sum, x) => sum + (Number(x.monthly_salary) || 0), 0),
    [items]
  );

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar funcionários.");
      setItems([]);
    } else {
      setItems((data ?? []) as Employee[]);
    }
    setEpoch((e) => e + 1);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault();

    const cleanName = name.trim();
    const cleanRole = role.trim();
    const salaryNum = parseNumber(salary);
    const hoursNum = parseNumber(hours);

    if (!cleanName) { toast.error("Nome é obrigatório."); return; }
    if (!cleanRole) { toast.error("Função é obrigatória."); return; }
    if (salaryNum === null || salaryNum < 0) { toast.error("Salário inválido."); return; }
    if (hoursNum === null || hoursNum <= 0) { toast.error("Horas/mês inválidas."); return; }

    const { data, error } = await supabase
      .from("employees")
      .insert({ name: cleanName, role: cleanRole, monthly_salary: salaryNum, monthly_hours: hoursNum })
      .select("id")
      .single();

    if (error) {
      toast.error("Erro ao adicionar funcionário.");
      return;
    }

    if (data) {
      await insertSalaryHistory(data.id, salaryNum, hoursNum);
    }

    setName("");
    setRole("");
    setSalary("");
    setHours("160");
    await load();
  }

  async function updateEmployee(
    id: string,
    patch: Partial<Pick<Employee, "name" | "role" | "monthly_salary" | "monthly_hours">>
  ) {
    setSavingId(id);
    const { error } = await supabase.from("employees").update(patch).eq("id", id);

    if (error) {
      setSavingId(null);
      toast.error("Erro ao atualizar funcionário.");
      return;
    }

    // Record salary history whenever salary or hours change.
    if ("monthly_salary" in patch || "monthly_hours" in patch) {
      const existing = items.find((x) => x.id === id);
      if (existing) {
        const newSalary = patch.monthly_salary ?? existing.monthly_salary;
        const newHours = patch.monthly_hours ?? existing.monthly_hours;
        await insertSalaryHistory(id, newSalary, newHours);
      }
    }

    setSavingId(null);
    await load();
  }

  async function remove(id: string) {
    setSavingId(id);
    const { error } = await supabase.from("employees").delete().eq("id", id);
    setSavingId(null);

    if (error) {
      toast.error("Erro ao apagar funcionário.");
      return;
    }

    await load();
  }

  return (
    <div className="space-y-6">
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        title="Apagar funcionário?"
        description="Este funcionário será removido permanentemente. Se tiver lançamentos de horas associados, a eliminação pode falhar — usa a opção Desativar em Definições."
        confirmLabel="Apagar"
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingDeleteId) remove(pendingDeleteId);
          setPendingDeleteId(null);
        }}
      />

      <PageHeader
        title="Funcionários"
        subtitle="Salários mensais. O total é proratado diariamente e incluído automaticamente nas despesas do Dashboard."
        actions={
          <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm">
            <div className="text-xs text-zinc-500">Total salários (mensal)</div>
            <div className="text-xl font-bold">{euro(totalSalary)}</div>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="text-sm font-semibold">Adicionar funcionário</h2>

          <form onSubmit={addEmployee} className="mt-4 space-y-3">
            <div>
              <label className="text-sm font-medium">Nome</label>
              <Input
                className="mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: João Silva"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Função</label>
              <Input
                className="mt-1"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Ex: Mecânico"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Salário mensal (€)</label>
              <Input
                className="mt-1"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="Ex: 1200,00"
                inputMode="decimal"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Horas/mês</label>
              <Input
                className="mt-1"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="Ex: 160"
                inputMode="numeric"
              />
            </div>

            <Button className="w-full">Adicionar</Button>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="text-sm font-semibold">Lista</h2>

          {loading ? (
            <div className="mt-4 text-sm text-zinc-600">A carregar…</div>
          ) : items.length === 0 ? (
            <div className="mt-4 text-sm text-zinc-600">
              Ainda não tens funcionários. Adiciona à esquerda.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-600">
                  <tr>
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2">Função</th>
                    <th className="px-3 py-2">Salário</th>
                    <th className="px-3 py-2">Horas/mês</th>
                    <th className="px-3 py-2">Custo/hora</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((x) => {
                    const costPerHour =
                      (Number(x.monthly_hours) || 0) > 0
                        ? Number(x.monthly_salary) / Number(x.monthly_hours)
                        : 0;

                    return (
                      <tr key={`${x.id}-${epoch}`} className="border-t">
                        <td className="px-3 py-2">
                          <input
                            className="w-full rounded-lg border px-2 py-1 text-sm"
                            defaultValue={x.name}
                            disabled={savingId === x.id}
                            onBlur={(e) =>
                              updateEmployee(x.id, { name: e.target.value.trim() })
                            }
                          />
                        </td>

                        <td className="px-3 py-2">
                          <input
                            className="w-full rounded-lg border px-2 py-1 text-sm"
                            defaultValue={x.role}
                            disabled={savingId === x.id}
                            onBlur={(e) =>
                              updateEmployee(x.id, { role: e.target.value.trim() })
                            }
                          />
                        </td>

                        <td className="px-3 py-2">
                          <input
                            className="w-32 rounded-lg border px-2 py-1 text-sm"
                            defaultValue={String(x.monthly_salary).replace(".", ",")}
                            disabled={savingId === x.id}
                            onBlur={(e) => {
                              const v = parseNumber(e.target.value);
                              if (v === null || v < 0) {
                                toast.error("Salário inválido.");
                                return;
                              }
                              updateEmployee(x.id, { monthly_salary: v });
                            }}
                          />
                        </td>

                        <td className="px-3 py-2">
                          <input
                            className="w-24 rounded-lg border px-2 py-1 text-sm"
                            defaultValue={String(x.monthly_hours).replace(".", ",")}
                            disabled={savingId === x.id}
                            onBlur={(e) => {
                              const v = parseNumber(e.target.value);
                              if (v === null || v <= 0) {
                                toast.error("Horas inválidas.");
                                return;
                              }
                              updateEmployee(x.id, { monthly_hours: v });
                            }}
                          />
                        </td>

                        <td className="px-3 py-2 font-semibold">
                          {euro(costPerHour)}
                        </td>

                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setPendingDeleteId(x.id)}
                            disabled={savingId === x.id}
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
            Dica: para guardar alterações, altera o campo e clica fora. As alterações de salário ficam registadas no histórico.
          </div>
        </Card>
      </div>
    </div>
  );
}
