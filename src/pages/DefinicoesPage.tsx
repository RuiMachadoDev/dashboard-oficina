import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

function euro(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `€ ${v.toFixed(2).replace(".", ",")}`;
}

function parseNumber(v: string) {
  const parsed = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

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
      <div>
        <h1 className="text-2xl font-bold">Definições</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Configurações globais da oficina.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-600">A carregar…</div>
      ) : (
        <div className="max-w-xl rounded-2xl border bg-white p-5 shadow-sm">
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
              <input
                value={hourlyRateInput}
                onChange={(e) => setHourlyRateInput(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                placeholder="Ex: 31,00"
              />
              <div className="mt-1 text-xs text-zinc-500">
                Aceita vírgula ou ponto.
              </div>
            </div>

            <button
              disabled={saving}
              className="w-full rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {saving ? "A guardar…" : "Guardar"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
