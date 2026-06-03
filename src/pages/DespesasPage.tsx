import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { FixedExpense } from "../types";
import { euro, parseNumber } from "../lib/format";
import { todayISO } from "../lib/dates";
import { toast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { AlertDialog } from "../components/ui/AlertDialog";
import { PageHeader } from "../components/ui/PageHeader";

async function insertExpenseHistory(expenseId: string, amount: number) {
  const { error } = await supabase.from("fixed_expenses_history").insert({
    expense_id: expenseId,
    amount,
    valid_from: todayISO(),
  });
  if (error) {
    console.error("expense history insert failed (non-fatal):", error);
  }
}

export default function DespesasPage() {
  const [items, setItems] = useState<FixedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);

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
      toast.error("Erro ao carregar despesas fixas.");
      setItems([]);
    } else {
      setItems((data ?? []) as FixedExpense[]);
    }
    setEpoch((e) => e + 1);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();

    const cleanName = name.trim();
    const value = parseNumber(amount);

    if (!cleanName) { toast.error("O nome da despesa é obrigatório."); return; }
    if (value === null || value < 0) { toast.error("Valor inválido. Usa um número (ex: 1200,00)."); return; }

    const { data, error } = await supabase
      .from("fixed_expenses")
      .insert({ name: cleanName, amount_monthly: value })
      .select("id")
      .single();

    if (error) {
      toast.error("Erro ao adicionar despesa.");
      return;
    }

    if (data) {
      await insertExpenseHistory(data.id, value);
    }

    setName("");
    setAmount("");
    await load();
  }

  async function updateAmount(id: string, valueStr: string) {
    const value = parseNumber(valueStr);
    if (value === null || value < 0) {
      toast.error("Valor inválido.");
      return;
    }

    setSavingId(id);
    const { error } = await supabase
      .from("fixed_expenses")
      .update({ amount_monthly: value })
      .eq("id", id);

    if (error) {
      setSavingId(null);
      toast.error("Erro ao atualizar despesa.");
      return;
    }

    await insertExpenseHistory(id, value);
    setSavingId(null);
    await load();
  }

  async function updateName(id: string, nameStr: string) {
    const clean = nameStr.trim();
    if (!clean) { toast.error("Nome inválido."); return; }

    setSavingId(id);
    const { error } = await supabase
      .from("fixed_expenses")
      .update({ name: clean })
      .eq("id", id);

    setSavingId(null);

    if (error) {
      toast.error("Erro ao atualizar nome.");
      return;
    }

    await load();
  }

  async function remove(id: string) {
    setSavingId(id);
    const { error } = await supabase.from("fixed_expenses").delete().eq("id", id);
    setSavingId(null);

    if (error) {
      toast.error("Erro ao apagar despesa.");
      return;
    }

    await load();
  }

  const pendingDeleteName = items.find((x) => x.id === pendingDeleteId)?.name ?? "";

  return (
    <div className="space-y-6">
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        title={`Apagar "${pendingDeleteName}"?`}
        description="Esta despesa fixa será removida. Os relatórios passados ficam corretos graças ao histórico guardado."
        confirmLabel="Apagar"
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingDeleteId) remove(pendingDeleteId);
          setPendingDeleteId(null);
        }}
      />

      <PageHeader
        title="Despesas Fixas"
        subtitle="Custos mensais recorrentes. As alterações ficam registadas no histórico para manter os relatórios passados corretos."
        actions={
          <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm">
            <div className="text-xs text-zinc-500">Total mensal</div>
            <div className="text-xl font-bold">{euro(total)}</div>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="text-sm font-semibold">Adicionar despesa</h2>

          <form onSubmit={addExpense} className="mt-4 space-y-3">
            <div>
              <label className="text-sm font-medium">Nome</label>
              <Input
                className="mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Renda"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Valor mensal (€)</label>
              <Input
                className="mt-1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ex: 1200,00"
                inputMode="decimal"
              />
              <p className="mt-1 text-xs text-zinc-500">Podes usar vírgula ou ponto.</p>
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
                    <tr key={`${x.id}-${epoch}`} className="border-t">
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
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 text-xs text-zinc-500">
            Dica: para guardar alterações, altera o campo e clica fora.
          </div>
        </Card>
      </div>
    </div>
  );
}
