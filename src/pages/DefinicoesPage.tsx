/**
 * Definições — financial cockpit settings hub.
 *
 * Three sections:
 *  1. Salários mensais  — who gets paid and how much (soft-delete only)
 *  2. Despesas fixas    — recurring monthly costs (rent, utilities, …)
 *  3. Tarifa/hora       — optional, for services billed by the hour
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Employee, FixedExpense } from "../types";
import { euro, parseNumber, round2 } from "../lib/format";
import { todayISO } from "../lib/dates";
import { toast } from "../lib/toast";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { AlertDialog } from "../components/ui/AlertDialog";
import { PageHeader } from "../components/ui/PageHeader";

// ── History helpers ───────────────────────────────────────────────────────────

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
  if (error) console.error("salary history insert (non-fatal):", error);
}

async function insertExpenseHistory(expenseId: string, amount: number) {
  const { error } = await supabase.from("fixed_expenses_history").insert({
    expense_id: expenseId,
    amount,
    valid_from: todayISO(),
  });
  if (error) console.error("expense history insert (non-fatal):", error);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DefinicoesPage() {
  const [loading, setLoading] = useState(true);

  // Settings
  const [hourlyRate, setHourlyRate] = useState<number | null>(null);
  const [hourlyRateInput, setHourlyRateInput] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  // Employees
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [empName, setEmpName] = useState("");
  const [empSalary, setEmpSalary] = useState("");
  const [savingEmpId, setSavingEmpId] = useState<string | null>(null);
  const [empEpoch, setEmpEpoch] = useState(0);
  const [pendingDeactivateId, setPendingDeactivateId] = useState<string | null>(null);

  // Fixed expenses
  const [expenses, setExpenses] = useState<FixedExpense[]>([]);
  const [expName, setExpName] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [savingExpId, setSavingExpId] = useState<string | null>(null);
  const [expEpoch, setExpEpoch] = useState(0);
  const [pendingDeleteExpId, setPendingDeleteExpId] = useState<string | null>(null);

  const totalSalaries = useMemo(
    () => employees.reduce((s, e) => s + (Number(e.monthly_salary) || 0), 0),
    [employees]
  );
  const totalFixed = useMemo(
    () => expenses.reduce((s, e) => s + (Number(e.amount_monthly) || 0), 0),
    [expenses]
  );
  const totalStructural = round2(totalSalaries + totalFixed);

  // ── Load ────────────────────────────────────────────────────────────────────

  async function load() {
    setLoading(true);

    const [settingsRes, fxRes] = await Promise.all([
      supabase.from("settings").select("hourly_rate").eq("id", 1).maybeSingle(),
      supabase.from("fixed_expenses").select("*").order("created_at"),
    ]);

    if (!settingsRes.error && settingsRes.data?.hourly_rate != null) {
      const v = Number(settingsRes.data.hourly_rate);
      setHourlyRate(v);
      setHourlyRateInput(String(v).replace(".", ","));
    }
    setExpenses(fxRes.error ? [] : (fxRes.data ?? []) as FixedExpense[]);

    // Load only active employees; fall back to all if active column is missing
    const empFiltered = await supabase
      .from("employees").select("*").eq("active", true).order("created_at");
    if (!empFiltered.error) {
      setEmployees((empFiltered.data ?? []) as Employee[]);
    } else {
      const empAll = await supabase.from("employees").select("*").order("created_at");
      setEmployees(empAll.error ? [] : (empAll.data ?? []) as Employee[]);
    }

    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Hourly rate ─────────────────────────────────────────────────────────────

  async function saveRate(e: React.FormEvent) {
    e.preventDefault();
    const v = parseNumber(hourlyRateInput);
    if (v === null || v <= 0) { toast.error("Valor/hora inválido."); return; }
    setSavingRate(true);
    const { error } = await supabase.from("settings").update({ hourly_rate: v }).eq("id", 1);
    if (error) { setSavingRate(false); toast.error("Erro ao guardar."); return; }
    await supabase.from("settings_history").insert({ hourly_rate: v, valid_from: todayISO() });
    setSavingRate(false);
    setHourlyRate(v);
    toast.success("Tarifa atualizada.");
  }

  // ── Employees ───────────────────────────────────────────────────────────────

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault();
    const name = empName.trim();
    const salary = parseNumber(empSalary);
    if (!name) { toast.error("Nome obrigatório."); return; }
    if (salary === null || salary < 0) { toast.error("Salário inválido."); return; }

    const { data, error } = await supabase
      .from("employees")
      .insert({ name, role: "", monthly_salary: salary, monthly_hours: 160, active: true })
      .select("id").single();

    if (error) { toast.error("Erro ao adicionar."); return; }
    if (data) await insertSalaryHistory(data.id, salary, 160);

    setEmpName(""); setEmpSalary("");
    await load(); setEmpEpoch((x) => x + 1);
  }

  async function updateEmployeeSalary(id: string, salaryStr: string) {
    const salary = parseNumber(salaryStr);
    if (salary === null || salary < 0) { toast.error("Salário inválido."); return; }
    setSavingEmpId(id);
    const { error } = await supabase.from("employees").update({ monthly_salary: salary }).eq("id", id);
    if (error) { setSavingEmpId(null); toast.error("Erro ao atualizar."); return; }
    await insertSalaryHistory(id, salary, 160);
    setSavingEmpId(null);
    await load(); setEmpEpoch((x) => x + 1);
  }

  async function updateEmployeeName(id: string, name: string) {
    const n = name.trim();
    if (!n) { toast.error("Nome inválido."); return; }
    setSavingEmpId(id);
    const { error } = await supabase.from("employees").update({ name: n }).eq("id", id);
    setSavingEmpId(null);
    if (error) { toast.error("Erro ao atualizar."); return; }
    await load(); setEmpEpoch((x) => x + 1);
  }

  /**
   * Soft-delete: sets active=false instead of DELETE.
   * This preserves time_entries and salary_history references so
   * historical reports remain correct. The employee simply stops
   * appearing in the active list and stops contributing to future costs.
   */
  async function deactivateEmployee(id: string) {
    setSavingEmpId(id);

    // Try soft-delete first (migration 003)
    const { error } = await supabase
      .from("employees")
      .update({ active: false })
      .eq("id", id);

    if (error) {
      // Migration 003 not applied yet — fall back to hard delete
      const { error: delError } = await supabase.from("employees").delete().eq("id", id);
      setSavingEmpId(null);
      if (delError) { toast.error("Erro ao remover funcionário."); return; }
    } else {
      setSavingEmpId(null);
    }

    toast.success("Funcionário desativado.");
    await load();
  }

  // ── Fixed expenses ──────────────────────────────────────────────────────────

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    const name = expName.trim();
    const amount = parseNumber(expAmount);
    if (!name) { toast.error("Nome obrigatório."); return; }
    if (amount === null || amount < 0) { toast.error("Valor inválido."); return; }

    const { data, error } = await supabase
      .from("fixed_expenses")
      .insert({ name, amount_monthly: amount })
      .select("id").single();

    if (error) { toast.error("Erro ao adicionar."); return; }
    if (data) await insertExpenseHistory(data.id, amount);

    setExpName(""); setExpAmount("");
    await load(); setExpEpoch((x) => x + 1);
  }

  async function updateExpenseAmount(id: string, amountStr: string) {
    const amount = parseNumber(amountStr);
    if (amount === null || amount < 0) { toast.error("Valor inválido."); return; }
    setSavingExpId(id);
    const { error } = await supabase.from("fixed_expenses").update({ amount_monthly: amount }).eq("id", id);
    if (error) { setSavingExpId(null); toast.error("Erro ao atualizar."); return; }
    await insertExpenseHistory(id, amount);
    setSavingExpId(null); await load(); setExpEpoch((x) => x + 1);
  }

  async function updateExpenseName(id: string, name: string) {
    const n = name.trim();
    if (!n) { toast.error("Nome inválido."); return; }
    setSavingExpId(id);
    const { error } = await supabase.from("fixed_expenses").update({ name: n }).eq("id", id);
    setSavingExpId(null);
    if (error) { toast.error("Erro ao atualizar."); return; }
    await load(); setExpEpoch((x) => x + 1);
  }

  async function deleteExpense(id: string) {
    setSavingExpId(id);
    const { error } = await supabase.from("fixed_expenses").delete().eq("id", id);
    setSavingExpId(null);
    if (error) { toast.error("Erro ao apagar."); return; }
    await load();
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Definições" subtitle="Configuração de custos recorrentes." />
        <div className="text-sm text-zinc-500">A carregar…</div>
      </div>
    );
  }

  const pendingDeactivateName =
    employees.find((e) => e.id === pendingDeactivateId)?.name ?? "";

  const pendingDeleteExpName =
    expenses.find((e) => e.id === pendingDeleteExpId)?.name ?? "";

  return (
    <div className="space-y-8">
      {/* Dialogs */}
      <AlertDialog
        open={pendingDeactivateId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeactivateId(null); }}
        title={`Desativar "${pendingDeactivateName}"?`}
        description="O funcionário deixa de aparecer nos custos futuros. O historial e todos os registos anteriores são preservados — os relatórios passados continuam corretos."
        confirmLabel="Desativar"
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingDeactivateId) deactivateEmployee(pendingDeactivateId);
          setPendingDeactivateId(null);
        }}
      />

      <AlertDialog
        open={pendingDeleteExpId !== null}
        onOpenChange={(open) => { if (!open) setPendingDeleteExpId(null); }}
        title={`Apagar "${pendingDeleteExpName}"?`}
        description="Esta despesa fixa será removida e deixará de ser considerada nos relatórios futuros."
        confirmLabel="Apagar"
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingDeleteExpId) deleteExpense(pendingDeleteExpId);
          setPendingDeleteExpId(null);
        }}
      />

      <PageHeader
        title="Definições"
        subtitle="Custos recorrentes mensais e configuração da oficina."
        actions={
          <div className="rounded-xl border bg-white px-4 py-2.5 shadow-sm text-right">
            <div className="text-xs text-zinc-400">Custo estrutural/mês</div>
            <div className="text-xl font-bold">{euro(totalStructural)}</div>
            <div className="text-xs text-zinc-400">
              sal. {euro(totalSalaries)} · fix. {euro(totalFixed)}
            </div>
          </div>
        }
      />

      {/* ── 1. Salários mensais ─────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <h2 className="text-sm font-semibold">Salários mensais</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Proratados diariamente no Dashboard. Alterações de valor ficam registadas no histórico.
              Desativar preserva todos os dados históricos.
            </p>
          </div>
          <span className="text-sm font-semibold">{euro(totalSalaries)}/mês</span>
        </div>

        <Card>
          {employees.length > 0 && (
            <div className="overflow-hidden rounded-xl border mb-4">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2">Salário/mês</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={`${emp.id}-${empEpoch}`} className="border-t">
                      <td className="px-3 py-2">
                        <input
                          className="w-full rounded-lg border px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-zinc-200"
                          defaultValue={emp.name}
                          disabled={savingEmpId === emp.id}
                          onBlur={(e) => updateEmployeeName(emp.id, e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-36 rounded-lg border px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-zinc-200"
                          defaultValue={String(emp.monthly_salary).replace(".", ",")}
                          disabled={savingEmpId === emp.id}
                          onBlur={(e) => updateEmployeeSalary(emp.id, e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setPendingDeactivateId(emp.id)}
                          disabled={savingEmpId === emp.id}
                        >
                          Desativar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form onSubmit={addEmployee} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-40">
              <label className="text-xs font-medium text-zinc-600">Nome</label>
              <Input className="mt-1" value={empName} onChange={(e) => setEmpName(e.target.value)} placeholder="Ex: João Silva" />
            </div>
            <div className="w-36">
              <label className="text-xs font-medium text-zinc-600">Salário/mês (€)</label>
              <Input className="mt-1" value={empSalary} onChange={(e) => setEmpSalary(e.target.value)} placeholder="1200,00" inputMode="decimal" />
            </div>
            <Button type="submit">Adicionar</Button>
          </form>

          {employees.length === 0 && (
            <p className="mt-3 text-xs text-zinc-400">
              Sem funcionários ativos. Adiciona os salários mensais para que apareçam como custo no Dashboard.
            </p>
          )}
        </Card>
      </section>

      {/* ── 2. Despesas fixas ────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <h2 className="text-sm font-semibold">Despesas fixas mensais</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Renda, eletricidade, água, seguros e outros custos recorrentes.
            </p>
          </div>
          <span className="text-sm font-semibold">{euro(totalFixed)}/mês</span>
        </div>

        <Card>
          {expenses.length > 0 && (
            <div className="overflow-hidden rounded-xl border mb-4">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Despesa</th>
                    <th className="px-3 py-2">Valor/mês</th>
                    <th className="px-3 py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((exp) => (
                    <tr key={`${exp.id}-${expEpoch}`} className="border-t">
                      <td className="px-3 py-2">
                        <input
                          className="w-full rounded-lg border px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-zinc-200"
                          defaultValue={exp.name}
                          disabled={savingExpId === exp.id}
                          onBlur={(e) => updateExpenseName(exp.id, e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="w-36 rounded-lg border px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-zinc-200"
                          defaultValue={String(exp.amount_monthly).replace(".", ",")}
                          disabled={savingExpId === exp.id}
                          onBlur={(e) => updateExpenseAmount(exp.id, e.target.value)}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setPendingDeleteExpId(exp.id)}
                          disabled={savingExpId === exp.id}
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

          <form onSubmit={addExpense} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-40">
              <label className="text-xs font-medium text-zinc-600">Nome</label>
              <Input className="mt-1" value={expName} onChange={(e) => setExpName(e.target.value)} placeholder="Ex: Renda, Eletricidade…" />
            </div>
            <div className="w-36">
              <label className="text-xs font-medium text-zinc-600">Valor/mês (€)</label>
              <Input className="mt-1" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder="1200,00" inputMode="decimal" />
            </div>
            <Button type="submit">Adicionar</Button>
          </form>
        </Card>
      </section>

      {/* ── 3. Tarifa/hora ──────────────────────────────────────────────── */}
      <section>
        <div className="mb-3">
          <h2 className="text-sm font-semibold">Tarifa horária (opcional)</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Valor por hora para serviços de reparação. Não é necessário se usas valores diretos em Movimentos.
          </p>
        </div>
        <Card className="max-w-sm">
          {hourlyRate !== null && (
            <div className="mb-4 rounded-xl bg-zinc-50 px-4 py-3">
              <div className="text-xs text-zinc-500">Atual</div>
              <div className="text-2xl font-bold">
                {euro(hourlyRate)}<span className="text-sm font-normal text-zinc-400">/h</span>
              </div>
            </div>
          )}
          <form onSubmit={saveRate} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium text-zinc-600">Novo valor/hora (€)</label>
              <Input
                className="mt-1"
                value={hourlyRateInput}
                onChange={(e) => setHourlyRateInput(e.target.value)}
                inputMode="decimal"
                placeholder="31,00"
              />
            </div>
            <Button disabled={savingRate}>{savingRate ? "…" : "Guardar"}</Button>
          </form>
        </Card>
      </section>

      <p className="text-xs text-zinc-400">
        Para registar pagamentos reais (salários, renda, fornecedores), usa a página <strong>Movimentos</strong>.
        As configurações aqui representam custos estruturais estimados proratados automaticamente.
      </p>
    </div>
  );
}
