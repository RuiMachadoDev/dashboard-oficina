import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { euro, parseNumber } from "../lib/format";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";

export default function DefinicoesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [hourlyRate, setHourlyRate] = useState<number>(31);
  const [hourlyRateInput, setHourlyRateInput] = useState<string>("31");

  async function load() {
    setLoading(true);

    const res = await supabase
      .from("settings")
      .select("hourly_rate")
      .eq("id", 1)
      .maybeSingle();

    if (res.error) {
      console.error("load settings failed:", res.error);
    } else if (res.data?.hourly_rate != null) {
      const v = Number(res.data.hourly_rate);
      setHourlyRate(v);
      setHourlyRateInput(String(v).replace(".", ","));
    }

    setLoading(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();

    const v = parseNumber(hourlyRateInput);
    if (v === null || v <= 0) return alert("Valor/hora inválido.");

    setSaving(true);

    const res = await supabase
      .from("settings")
      .update({ hourly_rate: v })
      .eq("id", 1);

    setSaving(false);

    if (res.error) {
      console.error("update settings failed:", res.error);
      alert("Erro ao guardar.");
      return;
    }

    setHourlyRate(v);
    alert("Tarifa/hora atualizada.");
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Definições"
        subtitle="Configurações globais da oficina."
      />

      {loading ? (
        <div className="text-sm text-zinc-600">A carregar…</div>
      ) : (
        <Card className="max-w-xl">
          <div className="text-sm font-semibold">Tarifa de mão-de-obra</div>
          <div className="mt-1 text-xs text-zinc-500">
            Valor que cobras ao cliente por hora.
          </div>

          <div className="mt-4 rounded-xl bg-zinc-50 px-4 py-3">
            <div className="text-xs text-zinc-500">Atual</div>
            <div className="text-lg font-bold">{euro(hourlyRate)}</div>
          </div>

          <form onSubmit={save} className="mt-4 space-y-3">
            <div>
              <label className="text-sm font-medium">Novo valor/hora</label>
              <Input
                value={hourlyRateInput}
                onChange={(e) => setHourlyRateInput(e.target.value)}
                inputMode="decimal"
                className="mt-1"
                placeholder="Ex: 31,00"
              />
              <div className="mt-1 text-xs text-zinc-500">
                Aceita vírgula ou ponto.
              </div>
            </div>

            <Button disabled={saving} className="w-full">
              {saving ? "A guardar…" : "Guardar"}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
