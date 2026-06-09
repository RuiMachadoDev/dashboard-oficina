import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { FinancialEntry } from "../types";
import { euro, parseNumber } from "../lib/format";
import { todayISO, todayYM } from "../lib/dates";
import { toast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { AlertDialog } from "../components/ui/AlertDialog";
import { PageHeader } from "../components/ui/PageHeader";
import { MonthPicker } from "../components/ui/MonthPicker";
import { DatePicker } from "../components/ui/DatePicker";

const LS_MONTH     = "movimentos.month";
const LS_GAIN_DATE = "movimentos.gainDate";
const LS_LOSS_DATE = "movimentos.lossDate";
const PAGE_SIZE = 10;

function readLS(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function writeLS(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

export default function MovimentosPage() {
  const [items, setItems] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const [month, setMonth] = useState(() => readLS(LS_MONTH, todayYM()));

  const [gainDate, setGainDate] = useState(() => readLS(LS_GAIN_DATE, todayISO()));
  const [gainValue, setGainValue] = useState("");
  const [gainNotes, setGainNotes] = useState("");
  const [savingGain, setSavingGain] = useState(false);

  const [lossDate, setLossDate] = useState(() => readLS(LS_LOSS_DATE, todayISO()));
  const [lossValue, setLossValue] = useState("");
  const [lossNotes, setLossNotes] = useState("");
  const [savingLoss, setSavingLoss] = useState(false);

  useEffect(() => { writeLS(LS_MONTH, month); }, [month]);
  useEffect(() => { writeLS(LS_GAIN_DATE, gainDate); }, [gainDate]);
  useEffect(() => { writeLS(LS_LOSS_DATE, lossDate); }, [lossDate]);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    const { data, error } = await supabase
      .from("financial_entries")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar registos. Confirma que a migração 004 foi aplicada.");
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
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_entries" }, () => load(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredItems = useMemo(
    () => items.filter((e) => e.date.startsWith(month)),
    [items, month]
  );

  const monthTotals = useMemo(() => {
    const totalGains = filteredItems.reduce((s, e) => s + (Number(e.revenue) || 0), 0);
    const totalLosses = filteredItems.reduce((s, e) => s + (Number(e.expenses) || 0), 0);
    return { totalGains, totalLosses };
  }, [filteredItems]);

  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pageItems = filteredItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset to first page when month filter changes
  useEffect(() => { setPage(0); }, [month]);

  // Clamp page when items are removed so we never show an empty page
  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filteredItems.length / PAGE_SIZE) - 1);
    setPage((p) => (p > maxPage ? maxPage : p));
  }, [filteredItems.length]);

  async function submitGain(evt: React.FormEvent) {
    evt.preventDefault();
    const amount = parseNumber(gainValue);
    if (amount === null || amount <= 0) { toast.error("Valor inválido."); return; }
    setSavingGain(true);
    const { error } = await supabase.from("financial_entries").insert({
      period_type: "day",
      date: gainDate,
      revenue: amount,
      expenses: 0,
      notes: gainNotes.trim() || null,
    });
    setSavingGain(false);
    if (error) { toast.error("Erro ao guardar ganhos."); return; }
    setGainValue("");
    setGainNotes("");
    // gainDate intentionally kept — user likely entering multiple days in sequence
    toast.success("Ganhos guardados.");
    await load(true);
  }

  async function submitLoss(evt: React.FormEvent) {
    evt.preventDefault();
    const amount = parseNumber(lossValue);
    if (amount === null || amount <= 0) { toast.error("Valor inválido."); return; }
    setSavingLoss(true);
    const { error } = await supabase.from("financial_entries").insert({
      period_type: "day",
      date: lossDate,
      revenue: 0,
      expenses: amount,
      notes: lossNotes.trim() || null,
    });
    setSavingLoss(false);
    if (error) { toast.error("Erro ao guardar despesas."); return; }
    setLossValue("");
    setLossNotes("");
    // lossDate intentionally kept
    toast.success("Despesas guardadas.");
    await load(true);
  }

  async function remove(id: string) {
    const { error } = await supabase.from("financial_entries").delete().eq("id", id);
    if (error) { toast.error("Erro ao apagar."); return; }
    await load(true);
  }

  return (
    <div className="space-y-6">
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}
        title="Apagar registo?"
        description="Este registo será removido permanentemente."
        confirmLabel="Apagar"
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingDeleteId) remove(pendingDeleteId);
          setPendingDeleteId(null);
        }}
      />

      <PageHeader
        title="Registo rápido"
        subtitle="Insere os totais diários de ganhos e despesas. O dashboard agrega automaticamente por semana, mês e ano."
        actions={<MonthPicker value={month} onChange={setMonth} />}
      />

      {/* Month summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-sm text-zinc-500">Total de ganhos</div>
          <div className="mt-2 text-xl font-bold text-emerald-700">{euro(monthTotals.totalGains)}</div>
        </Card>
        <Card>
          <div className="text-sm text-zinc-500">Total de perdas</div>
          <div className="mt-2 text-xl font-bold text-rose-700">{euro(monthTotals.totalLosses)}</div>
        </Card>
        <Card>
          <div className="text-sm text-zinc-500">Resultado</div>
          <div className={`mt-2 text-xl font-bold ${monthTotals.totalGains - monthTotals.totalLosses >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {euro(monthTotals.totalGains - monthTotals.totalLosses)}
          </div>
        </Card>
      </div>

      {/* Two entry panels */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Ganhos */}
        <Card>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <h2 className="font-semibold text-zinc-800">Ganhos</h2>
          </div>
          <form onSubmit={submitGain} className="mt-4 space-y-4">
            <div>
              <label className="text-xs text-zinc-400">Data</label>
              <DatePicker value={gainDate} onChange={setGainDate} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Total ganhos (€)</label>
              <Input
                className="mt-1"
                value={gainValue}
                onChange={(e) => setGainValue(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Nota (opcional)</label>
              <Input
                className="mt-1"
                value={gainNotes}
                onChange={(e) => setGainNotes(e.target.value)}
                placeholder="Ex: total faturado do dia"
              />
            </div>
            <Button className="w-full" disabled={savingGain}>
              {savingGain ? "A guardar…" : "Guardar ganhos"}
            </Button>
          </form>
        </Card>

        {/* Despesas / Perdas */}
        <Card>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500 flex-shrink-0" />
            <h2 className="font-semibold text-zinc-800">Despesas / Perdas</h2>
          </div>
          <form onSubmit={submitLoss} className="mt-4 space-y-4">
            <div>
              <label className="text-xs text-zinc-400">Data</label>
              <DatePicker value={lossDate} onChange={setLossDate} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Total despesas (€)</label>
              <Input
                className="mt-1"
                value={lossValue}
                onChange={(e) => setLossValue(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Nota (opcional)</label>
              <Input
                className="mt-1"
                value={lossNotes}
                onChange={(e) => setLossNotes(e.target.value)}
                placeholder="Ex: total gasto do dia"
              />
            </div>
            <Button className="w-full" disabled={savingLoss}>
              {savingLoss ? "A guardar…" : "Guardar despesas"}
            </Button>
          </form>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Registos do mês</h2>
          <span className="text-xs text-zinc-500">{filteredItems.length} registos</span>
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-zinc-600">A carregar…</div>
        ) : filteredItems.length === 0 ? (
          <div className="mt-4 text-sm text-zinc-600">
            Sem registos neste mês. Usa os painéis acima para adicionar.
          </div>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-600">
                  <tr>
                    <th className="px-3 py-2 w-8">#</th>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2">Nota</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((e, i) => {
                    const isGain = (Number(e.revenue) || 0) > 0;
                    const value = isGain ? Number(e.revenue) : Number(e.expenses);
                    return (
                      <tr key={e.id} className="border-t even:bg-zinc-50/50">
                        <td className="px-3 py-2 text-xs text-zinc-400 select-none">
                          {page * PAGE_SIZE + i + 1}
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-600 whitespace-nowrap">
                          {e.date}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${isGain ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${isGain ? "bg-emerald-500" : "bg-rose-500"}`} />
                            {isGain ? "Ganho" : "Despesa"}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${isGain ? "text-emerald-700" : "text-rose-700"}`}>
                          {euro(value)}
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-500 max-w-[160px] truncate">
                          {e.notes ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setPendingDeleteId(e.id)}
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

            {pageCount > 1 && (
              <div className="mt-3 flex items-center justify-between">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ← Anterior
                </Button>
                <span className="text-xs text-zinc-500">{page + 1} / {pageCount}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Seguinte →
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
