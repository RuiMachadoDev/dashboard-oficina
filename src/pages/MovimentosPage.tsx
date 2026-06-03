import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { FinancialMovement, MovementType } from "../types";
import { euro, parseNumber } from "../lib/format";
import { todayISO, todayYM } from "../lib/dates";
import { toast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { AlertDialog } from "../components/ui/AlertDialog";
import { PageHeader } from "../components/ui/PageHeader";
import { MonthPicker } from "../components/ui/MonthPicker";
import { DatePicker } from "../components/ui/DatePicker";

// Income categories: generic, no overlap with Settings
const INCOME_CATEGORIES = [
  "Faturação oficina",
  "Peças / material vendido",
  "Outros rendimentos",
];

// Expense categories: variable / one-off costs only.
// Salários and despesas fixas mensais (renda, utilities, etc.) are configured
// in Definições and auto-included in the dashboard — do NOT add them here.
const EXPENSE_CATEGORIES = [
  "Fornecedores / peças",
  "Ferramentas",
  "Consumíveis",
  "Reparações / manutenção",
  "Impostos / taxas",
  "Outros custos",
];

const TYPE_LABELS: Record<MovementType, string> = {
  income: "Receita",
  expense: "Despesa",
};

const LS_MONTH = "movimentos.month";

export default function MovimentosPage() {
  const [items, setItems] = useState<FinancialMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [month, setMonth] = useState<string>(() => {
    try { return localStorage.getItem(LS_MONTH) || todayYM(); } catch { return todayYM(); }
  });

  // Form state
  const [date, setDate] = useState(todayISO());
  const [type, setType] = useState<MovementType>("expense");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  // Keep category in sync when type changes
  function handleTypeChange(t: MovementType) {
    setType(t);
    const cats = t === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    setCategory(cats[0]);
  }

  useEffect(() => {
    try { localStorage.setItem(LS_MONTH, month); } catch { /* ignore */ }
  }, [month]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("financial_movements")
      .select("*")
      .order("date", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar movimentos. Confirma que a migração 002 foi aplicada.");
      setItems([]);
    } else {
      setItems((data ?? []) as FinancialMovement[]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const ch = supabase
      .channel("movimentos_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_movements" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredItems = useMemo(
    () => items.filter((m) => m.date.startsWith(month)),
    [items, month]
  );

  const monthTotals = useMemo(() => {
    const income = filteredItems.filter((m) => m.type === "income").reduce((s, m) => s + (Number(m.amount) || 0), 0);
    const expense = filteredItems.filter((m) => m.type === "expense").reduce((s, m) => s + (Number(m.amount) || 0), 0);
    return { income, expense, balance: income - expense };
  }, [filteredItems]);

  async function addMovement(e: React.FormEvent) {
    e.preventDefault();

    if (!date) { toast.error("Data é obrigatória."); return; }
    if (!category) { toast.error("Categoria é obrigatória."); return; }
    const value = parseNumber(amount);
    if (value === null || value <= 0) { toast.error("Valor inválido."); return; }

    const { error } = await supabase.from("financial_movements").insert({
      date,
      type,
      category,
      description: description.trim() || null,
      amount: value,
    });

    if (error) {
      toast.error("Erro ao registar movimento.");
      return;
    }

    setAmount("");
    setDescription("");
    toast.success("Movimento registado.");
    await load();
  }

  async function remove(id: string) {
    setSavingId(id);
    const { error } = await supabase.from("financial_movements").delete().eq("id", id);
    setSavingId(null);
    if (error) { toast.error("Erro ao apagar."); return; }
    await load();
  }

  return (
    <div className="space-y-6">
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        title="Apagar movimento?"
        description="Este registo será removido permanentemente."
        confirmLabel="Apagar"
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingDeleteId) remove(pendingDeleteId);
          setPendingDeleteId(null);
        }}
      />

      <PageHeader
        title="Movimentos"
        subtitle="Registo de receitas e despesas: salários, renda, utilidades, fornecedores, impostos e outros."
        actions={
          <div className="flex items-end gap-3">
            <MonthPicker value={month} onChange={setMonth} />
            <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm">
              <div className="text-xs text-zinc-500">Saldo do mês</div>
              <div className={`text-lg font-bold ${monthTotals.balance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {euro(monthTotals.balance)}
              </div>
            </div>
          </div>
        }
      />

      {/* Month summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-sm text-zinc-500">Receitas</div>
          <div className="mt-2 text-xl font-bold text-emerald-700">{euro(monthTotals.income)}</div>
        </Card>
        <Card>
          <div className="text-sm text-zinc-500">Despesas</div>
          <div className="mt-2 text-xl font-bold text-rose-700">{euro(monthTotals.expense)}</div>
        </Card>
        <Card>
          <div className="text-sm text-zinc-500">Saldo</div>
          <div className={`mt-2 text-xl font-bold ${monthTotals.balance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {euro(monthTotals.balance)}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Form */}
        <Card>
          <h2 className="text-sm font-semibold">Registar movimento</h2>
          <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
            Usa esta página para registar entradas e saídas pontuais ou totais
            diários/semanais. <strong>Salários e despesas fixas mensais</strong> são
            configurados nas <strong>Definições</strong> e entram automaticamente nos
            cálculos — não os adiciones aqui para evitar duplicação.
          </p>
          <form onSubmit={addMovement} className="mt-4 space-y-3">
            <div>
              <label className="text-sm font-medium">Data</label>
              <DatePicker value={date} onChange={setDate} className="mt-1" />
            </div>

            <div>
              <label className="text-sm font-medium">Tipo</label>
              <div className="mt-1 flex gap-2">
                {(["expense", "income"] as MovementType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTypeChange(t)}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                      type === t
                        ? t === "income"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-rose-300 bg-rose-50 text-rose-800"
                        : "bg-white text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Categoria</label>
              <Select
                className="mt-1"
                value={category}
                onChange={setCategory}
                options={categories.map((c) => ({ value: c, label: c }))}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Descrição (opcional)</label>
              <Input
                className="mt-1"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Pagamento abril"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Valor (€)</label>
              <Input
                className="mt-1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>

            <Button className="w-full">Registar</Button>
          </form>
        </Card>

        {/* List */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Movimentos do mês</h2>
            <span className="text-xs text-zinc-500">{filteredItems.length} registos</span>
          </div>

          {loading ? (
            <div className="mt-4 text-sm text-zinc-600">A carregar…</div>
          ) : filteredItems.length === 0 ? (
            <div className="mt-4 text-sm text-zinc-600">Sem movimentos neste mês. Regista à esquerda.</div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-600">
                  <tr>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Categoria</th>
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((m) => (
                    <tr key={m.id} className="border-t">
                      <td className="px-3 py-2 text-xs text-zinc-500 whitespace-nowrap">{m.date}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          m.type === "income"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}>
                          {m.category}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-600">{m.description ?? "—"}</td>
                      <td className={`px-3 py-2 text-right font-bold whitespace-nowrap ${
                        m.type === "income" ? "text-emerald-700" : "text-rose-700"
                      }`}>
                        {m.type === "income" ? "+" : "−"}{euro(Number(m.amount))}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setPendingDeleteId(m.id)}
                          disabled={savingId === m.id}
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
            Estes movimentos somam-se aos custos estruturais (salários e despesas fixas proratados) no Dashboard.
          </div>
        </Card>
      </div>
    </div>
  );
}
