import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Employee = {
  id: string;
  name: string;
  role: string;
  monthly_salary: number;
  monthly_hours: number;
  created_at: string;
};

function euro(n: number) {
  return `€ ${n.toFixed(2).replace(".", ",")}`;
}

function parseNumber(v: string) {
  const parsed = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export default function FuncionariosPage() {
  const [items, setItems] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

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
      console.error("load employees failed:", error);
      setItems([]);
    } else {
      setItems((data ?? []) as Employee[]);
    }
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

    if (!cleanName) return alert("Nome é obrigatório.");
    if (!cleanRole) return alert("Função é obrigatória.");
    if (salaryNum === null || salaryNum < 0) return alert("Salário inválido.");
    if (hoursNum === null || hoursNum <= 0) return alert("Horas/mês inválidas.");

    const { error } = await supabase.from("employees").insert({
      name: cleanName,
      role: cleanRole,
      monthly_salary: salaryNum,
      monthly_hours: hoursNum,
    });

    if (error) {
      console.error("insert employee failed:", error);
      alert("Erro ao adicionar funcionário.");
      return;
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
    setSavingId(null);

    if (error) {
      console.error("update employee failed:", error);
      alert("Erro ao atualizar funcionário.");
      return;
    }

    await load();
  }

  async function remove(id: string) {
    if (!confirm("Apagar este funcionário?")) return;

    setSavingId(id);
    const { error } = await supabase.from("employees").delete().eq("id", id);
    setSavingId(null);

    if (error) {
      console.error("delete employee failed:", error);
      alert("Erro ao apagar funcionário.");
      return;
    }

    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Funcionários</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Gestão de salários e custo/hora (para calcular lucro por mão-de-obra).
          </p>
        </div>

        <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm">
          <div className="text-xs text-zinc-500">Total salários (mensal)</div>
          <div className="text-xl font-bold">{euro(totalSalary)}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Form */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Adicionar funcionário</h2>

          <form onSubmit={addEmployee} className="mt-4 space-y-3">
            <div>
              <label className="text-sm font-medium">Nome</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: João Silva"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Função</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Ex: Mecânico"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Salário mensal (€)</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
                placeholder="Ex: 1200,00"
                inputMode="decimal"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Horas/mês</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="Ex: 160"
                inputMode="numeric"
              />
            </div>

            <button className="w-full rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
              Adicionar
            </button>
          </form>
        </div>

        {/* List */}
        <div className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-2">
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
                      <tr key={x.id} className="border-t">
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
                              if (v === null || v < 0) return alert("Salário inválido.");
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
                              if (v === null || v <= 0) return alert("Horas inválidas.");
                              updateEmployee(x.id, { monthly_hours: v });
                            }}
                          />
                        </td>

                        <td className="px-3 py-2 font-semibold">
                          {euro(costPerHour)}
                        </td>

                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => remove(x.id)}
                            disabled={savingId === x.id}
                            className="rounded-lg border px-2 py-1 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60"
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
            Dica: para guardar alterações, altera o campo e clica fora.
          </div>
        </div>
      </div>
    </div>
  );
}
