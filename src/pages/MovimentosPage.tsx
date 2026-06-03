import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { FinancialEntry, PeriodType } from "../types";
import { euro, parseNumber } from "../lib/format";
import { formatWeekRange, getISOWeek, getWeekStart, todayISO, todayYM } from "../lib/dates";
import { toast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { AlertDialog } from "../components/ui/AlertDialog";
import { PageHeader } from "../components/ui/PageHeader";
import { MonthPicker } from "../components/ui/MonthPicker";
import { DatePicker } from "../components/ui/DatePicker";

const LS_MONTH = "movimentos.month";

function weekLabel(date: string): string {
  const { year, week } = getISOWeek(date);
  return `Semana ${week} de ${year} — ${formatWeekRange(year, week)}`;
}

export default function MovimentosPage() {
  const [items, setItems] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [month, setMonth] = useState<string>(() => {
    try { return localStorage.getItem(LS_MONTH) || todayYM(); } catch { return todayYM(); }
  });

  // Form state
  const [periodType, setPeriodType] = useState<PeriodType>("day");
  const [date, setDate] = useState(todayISO());
  const [revenue, setRevenue] = useState("");
  const [expenses, setExpenses] = useState("");
  const [notes, setNotes] = useState("");

  // Derived week label for week-type entries
  const derivedWeekLabel = useMemo(() => weekLabel(date), [date]);

  useEffect(() => {
    try { localStorage.setItem(LS_MONTH, month); } catch { /* ignore */ }
  }, [month]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("financial_entries")
      .select("*")
      .order("date", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar entradas. Confirma que a migração 004 foi aplicada.");
      setItems([]);
    } else {
      setItems((data ?? []) as FinancialEntry[]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const ch = supabase
      .channel("movimentos_entries")
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_entries" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredItems = useMemo(
    () => items.filter((e) => e.date.startsWith(month)),
    [items, month]
  );

  const monthTotals = useMemo(() => {
    const rev = filteredItems.reduce((s, e) => s + (Number(e.revenue) || 0), 0);
    const exp = filteredItems.reduce((s, e) => s + (Number(e.expenses) || 0), 0);
    return { revenue: rev, expenses: exp };
  }, [filteredItems]);

  async function addEntry(evt: React.FormEvent) {
    evt.preventDefault();

    const rev = parseNumber(revenue);
    const exp = parseNumber(expenses);
    if (rev === null || rev < 0) { toast.error("Receita inválida."); return; }
    if (exp === null || exp < 0) { toast.error("Despesa inválida."); return; }
    if (rev === 0 && exp === 0) { toast.error("Introduz pelo menos um valor."); return; }

    // For week entries store the Monday of the ISO week
    const entryDate =
      periodType === "week"
        ? getWeekStart(getISOWeek(date).year, getISOWeek(date).week)
        : date;

    const { error } = await supabase.from("financial_entries").insert({
      period_type: periodType,
      date: entryDate,
      revenue: rev,
      expenses: exp,
      notes: notes.trim() || null,
    });

    if (error) {
      toast.error("Erro ao registar entrada.");
      return;
    }

    setRevenue("");
    setExpenses("");
    setNotes("");
    toast.success("Entrada registada.");
    await load();
  }

  async function remove(id: string) {
    setSavingId(id);
    const { error } = await supabase.from("financial_entries").delete().eq("id", id);
    setSavingId(null);
    if (error) { toast.error("Erro ao apagar."); return; }
    await load();
  }

  return (
    <div className="space-y-6">
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        title="Apagar entrada?"
        description="Este registo será removido permanentemente."
        confirmLabel="Apagar"
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingDeleteId) remove(pendingDeleteId);
          setPendingDeleteId(null);
        }}
      />

      <PageHeader
        title="Entradas financeiras"
        subtitle="Insere os totais diários ou semanais comunicados pela contabilidade."
        actions={
          <div className="flex items-end gap-3">
            <MonthPicker value={month} onChange={setMonth} />
          </div>
        }
      />

      {/* Month summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-sm text-zinc-500">Receita registada</div>
          <div className="mt-2 text-xl font-bold text-emerald-700">{euro(monthTotals.revenue)}</div>
        </Card>
        <Card>
          <div className="text-sm text-zinc-500">Despesa variável</div>
          <div className="mt-2 text-xl font-bold text-rose-700">{euro(monthTotals.expenses)}</div>
        </Card>
        <Card>
          <div className="text-sm text-zinc-500">Resultado bruto</div>
          <div className={`mt-2 text-xl font-bold ${monthTotals.revenue - monthTotals.expenses >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {euro(monthTotals.revenue - monthTotals.expenses)}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Form */}
        <Card>
          <h2 className="text-sm font-semibold">Registar entrada</h2>
          <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
            Pergunta à contabilidade quanto foi faturado e quanto se gastou.
            Insere os totais — o resto é calculado automaticamente.
          </p>

          <form onSubmit={addEntry} className="mt-4 space-y-4">
            {/* Period type */}
            <div>
              <label className="text-sm font-medium">Período</label>
              <div className="mt-1 flex gap-2">
                {(["day", "week"] as PeriodType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPeriodType(t)}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                      periodType === t
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "bg-white text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {t === "day" ? "Dia" : "Semana"}
                  </button>
                ))}
              </div>
            </div>

            {/* Date / Week */}
            <div>
              <label className="text-sm font-medium">
                {periodType === "day" ? "Data" : "Semana"}
              </label>
              <DatePicker value={date} onChange={setDate} className="mt-1" />
              {periodType === "week" && (
                <p className="mt-1 text-xs text-zinc-500">{derivedWeekLabel}</p>
              )}
            </div>

            {/* Revenue */}
            <div>
              <label className="text-sm font-medium">Receita registada (€)</label>
              <Input
                className="mt-1"
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>

            {/* Expenses */}
            <div>
              <label className="text-sm font-medium">Despesa variável (€)</label>
              <Input
                className="mt-1"
                value={expenses}
                onChange={(e) => setExpenses(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
              <p className="mt-1 text-xs text-zinc-400">
                Não incluir salários nem despesas fixas — essas entram automaticamente.
              </p>
            </div>

            {/* Notes */}
            <div>
              <label className="text-sm font-medium">Nota (opcional)</label>
              <Input
                className="mt-1"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: semana com feriado"
              />
            </div>

            <Button className="w-full">Registar</Button>
          </form>
        </Card>

        {/* List */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Entradas do mês</h2>
            <span className="text-xs text-zinc-500">{filteredItems.length} registos</span>
          </div>

          {loading ? (
            <div className="mt-4 text-sm text-zinc-600">A carregar…</div>
          ) : filteredItems.length === 0 ? (
            <div className="mt-4 text-sm text-zinc-600">
              Sem entradas neste mês. Regista à esquerda.
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-600">
                  <tr>
                    <th className="px-3 py-2">Período</th>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2 text-right">Receita</th>
                    <th className="px-3 py-2 text-right">Despesa</th>
                    <th className="px-3 py-2">Nota</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          e.period_type === "week"
                            ? "bg-violet-50 text-violet-700"
                            : "bg-zinc-100 text-zinc-700"
                        }`}>
                          {e.period_type === "week" ? "Semana" : "Dia"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500 whitespace-nowrap">
                        {e.period_type === "week"
                          ? weekLabel(e.date)
                          : e.date}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-700 whitespace-nowrap">
                        {euro(Number(e.revenue))}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-rose-700 whitespace-nowrap">
                        {euro(Number(e.expenses))}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500 max-w-[140px] truncate">
                        {e.notes ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setPendingDeleteId(e.id)}
                          disabled={savingId === e.id}
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
            Entradas semanais têm prioridade sobre entradas diárias da mesma semana ISO.
            Os custos estruturais (salários e despesas fixas) são adicionados automaticamente no Dashboard.
          </div>
        </Card>
      </div>
    </div>
  );
}
