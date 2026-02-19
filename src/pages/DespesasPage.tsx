import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type FixedExpense = {
  id: string;
  name: string;
  amount_monthly: number;
  created_at: string;
};

function euro(n: number) {
  return `€ ${n.toFixed(2).replace(".", ",")}`;
}

export default function DespesasPage() {
  const [items, setItems] = useState<FixedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");

  const total = useMemo(
    () => items.reduce((sum, x) => sum + (Number(x.amount_monthly) || 0), 0),
    [items]
  );

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("fixed_expenses")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("load fixed_expenses failed:", error);
      setItems([]);
    } else {
      setItems((data ?? []) as FixedExpense[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function parseAmount(v: string) {
    const parsed = Number(String(v).trim().replace("€", "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();

    const cleanName = name.trim();
    const value = parseAmount(amount);

    if (!cleanName) {
      alert("O nome da despesa é obrigatório.");
      return;
    }
    if (value === null || value < 0) {
      alert("Valor inválido. Usa um número (ex: 1200,00).");
      return;
    }

    const { error } = await supabase.from("fixed_expenses").insert({
      name: cleanName,
      amount_monthly: value,
    });

    if (error) {
      console.error("insert fixed_expenses failed:", error);
      alert("Erro ao adicionar despesa.");
      return;
    }

    setName("");
    setAmount("");
    await load();
  }

  async function updateAmount(id: string, valueStr: string) {
    const value = parseAmount(valueStr);
    if (value === null || value < 0) {
      alert("Valor inválido.");
      return;
    }

    setSavingId(id);
    const { error } = await supabase
      .from("fixed_expenses")
      .update({ amount_monthly: value })
      .eq("id", id);

    setSavingId(null);

    if (error) {
      console.error("update fixed_expenses failed:", error);
      alert("Erro ao atualizar despesa.");
      return;
    }

    await load();
  }

  async function updateName(id: string, nameStr: string) {
    const clean = nameStr.trim();
    if (!clean) {
      alert("Nome inválido.");
      return;
    }

    setSavingId(id);
    const { error } = await supabase
      .from("fixed_expenses")
      .update({ name: clean })
      .eq("id", id);

    setSavingId(null);

    if (error) {
      console.error("update name failed:", error);
      alert("Erro ao atualizar nome.");
      return;
    }

    await load();
  }

  async function remove(id: string) {
    if (!confirm("Apagar esta despesa?")) return;

    setSavingId(id);
    const { error } = await supabase.from("fixed_expenses").delete().eq("id", id);
    setSavingId(null);

    if (error) {
      console.error("delete fixed_expenses failed:", error);
      alert("Erro ao apagar despesa.");
      return;
    }

    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Despesas Fixas</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Custos mensais recorrentes (sem datas). Alteras aqui e o resto da app
            passa a refletir estes valores.
          </p>
        </div>

        <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm">
          <div className="text-xs text-zinc-500">Total mensal</div>
          <div className="text-xl font-bold">{euro(total)}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
    
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Adicionar despesa</h2>

          <form onSubmit={addExpense} className="mt-4 space-y-3">
            <div>
              <label className="text-sm font-medium">Nome</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Renda"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Valor mensal (€)</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ex: 1200,00"
                inputMode="decimal"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Podes usar vírgula ou ponto.
              </p>
            </div>

            <button className="w-full rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
              Adicionar
            </button>
          </form>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold">Lista</h2>

          {loading ? (
            <div className="mt-4 text-sm text-zinc-600">A carregar…</div>
          ) : items.length === 0 ? (
            <div className="mt-4 text-sm text-zinc-600">
              Ainda não tens despesas fixas. Adiciona à esquerda.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-600">
                  <tr>
                    <th className="px-3 py-2">Despesa</th>
                    <th className="px-3 py-2">Valor mensal</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((x) => (
                    <tr key={x.id} className="border-t">
                      <td className="px-3 py-2">
                        <input
                          className="w-full rounded-lg border px-2 py-1 text-sm"
                          defaultValue={x.name}
                          disabled={savingId === x.id}
                          onBlur={(e) => updateName(x.id, e.target.value)}
                        />
                      </td>

                      <td className="px-3 py-2">
                        <input
                          className="w-44 rounded-lg border px-2 py-1 text-sm"
                          defaultValue={String(x.amount_monthly).replace(".", ",")}
                          disabled={savingId === x.id}
                          onBlur={(e) => updateAmount(x.id, e.target.value)}
                        />
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
                  ))}
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
