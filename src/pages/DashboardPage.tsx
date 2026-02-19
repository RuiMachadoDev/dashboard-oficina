export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {["Faturado MO", "Custo MO", "Despesas Fixas", "Lucro Líquido"].map(
          (t) => (
            <div key={t} className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="text-sm text-zinc-600">{t}</div>
              <div className="mt-2 text-2xl font-bold">€ 0,00</div>
            </div>
          )
        )}
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-sm font-semibold">Estado da Oficina</div>
        <div className="mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
          OFICINA LUCRATIVA
        </div>
      </div>
    </div>
  );
}
