import { describe, it, expect } from "vitest";
import { computeAnalytics } from "./analytics";
import type { FinancialEntry } from "../types";
import { getISOWeek, getMonthDays, getWeekDays } from "./dates";
import { round2 } from "./format";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function entry(
  id: string,
  period_type: "day" | "week",
  date: string,
  revenue: number,
  expenses: number = 0
): FinancialEntry {
  return { id, period_type, date, revenue, expenses, notes: null, created_at: "" };
}

const noEmp: { monthly_salary: number }[] = [];
const noFx: { amount_monthly: number }[] = [];
const noLabel = () => "";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Day entries — basic summing
// ─────────────────────────────────────────────────────────────────────────────

describe("day entries: basic summing", () => {
  it("sums revenue and variable expenses across multiple day entries", () => {
    const dates = ["2026-06-01", "2026-06-02", "2026-06-03"];
    const entries = [
      entry("d1", "day", "2026-06-01", 1000, 200),
      entry("d2", "day", "2026-06-02", 1500, 300),
      entry("d3", "day", "2026-06-03",  500, 100),
    ];
    const a = computeAnalytics(dates, entries, noEmp, noFx, noLabel);
    expect(a.entryRevenue).toBe(3000);
    expect(a.variableExpenses).toBe(600);
    expect(a.totalRevenue).toBe(3000);
    expect(a.netProfit).toBe(2400);
  });

  it("ignores day entries whose date falls outside the given dates array", () => {
    const dates = ["2026-06-01", "2026-06-02"];
    const entries = [
      entry("d1", "day", "2026-06-01", 1000, 0),
      entry("d2", "day", "2026-06-05",  999, 0), // outside the period
    ];
    const a = computeAnalytics(dates, entries, noEmp, noFx, noLabel);
    expect(a.entryRevenue).toBe(1000);
  });

  it("returns zero revenue when no entries exist", () => {
    const dates = ["2026-06-01", "2026-06-02"];
    const a = computeAnalytics(dates, [], noEmp, noFx, noLabel);
    expect(a.entryRevenue).toBe(0);
    expect(a.totalRevenue).toBe(0);
    expect(a.variableExpenses).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Week entry — full week in period (no proration needed)
// ─────────────────────────────────────────────────────────────────────────────

describe("week entry: full week in period", () => {
  // 2026-06-01 is Monday → full ISO week Mon 1 Jun – Sun 7 Jun
  const weekMonday = "2026-06-01";
  const { year, week } = getISOWeek(weekMonday);
  const weekDates = getWeekDays(year, week); // ["2026-06-01", …, "2026-06-07"]

  it("counts the full week total when all 7 days are in the period", () => {
    const e = entry("w1", "week", weekMonday, 7000, 700);
    const a = computeAnalytics(weekDates, [e], noEmp, noFx, noLabel);
    expect(a.entryRevenue).toBe(7000);
    expect(a.variableExpenses).toBe(700);
    expect(a.netProfit).toBe(6300);
  });

  it("distributes week entry evenly across byDay for bar-chart display", () => {
    const e = entry("w1", "week", weekMonday, 7000, 0);
    const a = computeAnalytics(weekDates, [e], noEmp, noFx, noLabel);
    expect(a.byDay).toHaveLength(7);
    // Each day should carry 7000/7 = 1000
    for (const d of a.byDay) expect(d.revenue).toBeCloseTo(1000, 2);
    // Sum across byDay must equal the week total
    const sumByDay = round2(a.byDay.reduce((s, d) => s + d.revenue, 0));
    expect(sumByDay).toBeCloseTo(7000, 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Week entry proration across a month boundary
//
// 2026-03-30 (Monday) → 2026-04-05 (Sunday)
//   March gets 2 days (30, 31)
//   April gets 5 days (1–5)
//   7000 × 2/7 = 2000 in March, 7000 × 5/7 = 5000 in April
// ─────────────────────────────────────────────────────────────────────────────

describe("week entry proration at month boundary", () => {
  const weekMonday = "2026-03-30";
  const we = entry("w1", "week", weekMonday, 7000, 700);

  it("assigns the full amount when the full 7-day week is the period", () => {
    const { year, week } = getISOWeek(weekMonday);
    const dates = getWeekDays(year, week);
    const a = computeAnalytics(dates, [we], noEmp, noFx, noLabel);
    expect(a.entryRevenue).toBe(7000);
    expect(a.variableExpenses).toBe(700);
  });

  it("prorates to 5/7 when only the April portion (5 days) is the period", () => {
    const aprilDates = getMonthDays("2026-04");
    const a = computeAnalytics(aprilDates, [we], noEmp, noFx, noLabel);
    // 7000 × 5/7 = 5000, 700 × 5/7 = 500
    expect(a.entryRevenue).toBe(round2(7000 * 5 / 7));  // 5000
    expect(a.variableExpenses).toBe(round2(700 * 5 / 7)); // 500
  });

  it("prorates to 2/7 when only the March portion (2 days) is the period", () => {
    const marchDates = getMonthDays("2026-03");
    const a = computeAnalytics(marchDates, [we], noEmp, noFx, noLabel);
    // 7000 × 2/7 = 2000, 700 × 2/7 = 200
    expect(a.entryRevenue).toBe(round2(7000 * 2 / 7));  // 2000
    expect(a.variableExpenses).toBe(round2(700 * 2 / 7)); // 200
  });

  it("prorated March + April portions sum to the full week total", () => {
    const marchDates = getMonthDays("2026-03");
    const aprilDates = getMonthDays("2026-04");
    const aMarch = computeAnalytics(marchDates, [we], noEmp, noFx, noLabel);
    const aApril = computeAnalytics(aprilDates, [we], noEmp, noFx, noLabel);
    expect(round2(aMarch.entryRevenue + aApril.entryRevenue)).toBe(7000);
    expect(round2(aMarch.variableExpenses + aApril.variableExpenses)).toBe(700);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Double-counting prevention — week entry wins over day entries
// ─────────────────────────────────────────────────────────────────────────────

describe("double-counting prevention: week entry wins over day entries", () => {
  // 2026-06-01 (Monday) → 2026-06-07 (Sunday)
  const weekMonday = "2026-06-01";
  const { year, week } = getISOWeek(weekMonday);
  const weekDates = getWeekDays(year, week);

  it("ignores day entries that fall inside the same ISO week as a week entry", () => {
    const we = entry("w1", "week", weekMonday, 5000, 500);
    const d1 = entry("d1", "day", "2026-06-01",  999, 0); // same week — must be ignored
    const d2 = entry("d2", "day", "2026-06-03",  999, 0); // same week — must be ignored
    const a = computeAnalytics(weekDates, [we, d1, d2], noEmp, noFx, noLabel);
    expect(a.entryRevenue).toBe(5000);
    expect(a.variableExpenses).toBe(500);
  });

  it("includes day entries when no week entry exists for that ISO week", () => {
    const d1 = entry("d1", "day", "2026-06-01", 1000, 100);
    const d2 = entry("d2", "day", "2026-06-03", 2000, 200);
    const a = computeAnalytics(weekDates, [d1, d2], noEmp, noFx, noLabel);
    expect(a.entryRevenue).toBe(3000);
    expect(a.variableExpenses).toBe(300);
  });

  it("only blocks day entries in the covered ISO week, not adjacent weeks", () => {
    const we = entry("w1", "week", weekMonday, 5000, 0); // blocks W23 (Jun 1–7)
    // Day entry in the next ISO week (Jun 8 = Monday of W24)
    const nextWeekDay = entry("d1", "day", "2026-06-08", 1000, 0);
    const allDates = [...weekDates, "2026-06-08"];
    const a = computeAnalytics(allDates, [we, nextWeekDay], noEmp, noFx, noLabel);
    // Week entry contributes 5000 (all 7 days present → fraction = 1)
    // Day entry for Jun 8 is in W24, not blocked → contributes 1000
    expect(a.entryRevenue).toBe(6000);
  });

  it("day entries in adjacent weeks coexist with a week entry in another week", () => {
    // Week entry covers Jun 1–7 (W23); day entry is Jun 14 (W24)
    const we = entry("w1", "week", weekMonday,  5000, 0);
    const d  = entry("d1", "day",  "2026-06-14", 1000, 0);
    const dates = [...weekDates, "2026-06-08", "2026-06-09", "2026-06-10",
                   "2026-06-11", "2026-06-12", "2026-06-13", "2026-06-14"];
    const a = computeAnalytics(dates, [we, d], noEmp, noFx, noLabel);
    expect(a.entryRevenue).toBe(6000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Structural costs — prorated daily
// ─────────────────────────────────────────────────────────────────────────────

describe("structural costs: daily proration", () => {
  it("prorates one employee salary for a single day in a 31-day month", () => {
    const dates = ["2026-01-15"]; // January = 31 days
    const a = computeAnalytics(dates, [], [{ monthly_salary: 3100 }], [], noLabel);
    expect(a.salaryCost).toBe(100); // 3100 / 31
    expect(a.fixedCost).toBe(0);
    expect(a.totalExpenses).toBe(100);
  });

  it("prorates fixed expenses for a single day in a 30-day month", () => {
    const dates = ["2026-06-15"]; // June = 30 days
    const a = computeAnalytics(dates, [], [], [{ amount_monthly: 1500 }], noLabel);
    expect(a.fixedCost).toBe(50); // 1500 / 30
    expect(a.salaryCost).toBe(0);
  });

  it("accumulates structural costs across all days in a 7-day period", () => {
    const { year, week } = getISOWeek("2026-06-01");
    const dates = getWeekDays(year, week); // 7 days in June (30 days)
    const a = computeAnalytics(dates, [], [{ monthly_salary: 3000 }], [], noLabel);
    // 3000 / 30 × 7 = 700
    expect(a.salaryCost).toBe(700);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Net profit formula
// ─────────────────────────────────────────────────────────────────────────────

describe("net profit = revenue − variable expenses − structural costs", () => {
  it("computes net profit correctly for a single day with all cost types", () => {
    // June 2026 = 30 days
    // Revenue: 2000, Variable expenses: 300
    // Salary: 3000 / 30 = 100, Fixed: 1500 / 30 = 50
    // Net: 2000 - 300 - 100 - 50 = 1550
    const dates = ["2026-06-01"];
    const entries = [entry("e1", "day", "2026-06-01", 2000, 300)];
    const a = computeAnalytics(
      dates,
      entries,
      [{ monthly_salary: 3000 }],
      [{ amount_monthly: 1500 }],
      noLabel
    );
    expect(a.totalRevenue).toBe(2000);
    expect(a.variableExpenses).toBe(300);
    expect(a.salaryCost).toBe(100);
    expect(a.fixedCost).toBe(50);
    expect(a.totalExpenses).toBe(450);
    expect(a.netProfit).toBe(1550);
    expect(a.isProfitable).toBe(true);
  });

  it("reports unprofitable when expenses exceed revenue", () => {
    const dates = ["2026-06-01"];
    const entries = [entry("e1", "day", "2026-06-01", 50, 0)];
    const a = computeAnalytics(dates, entries, [{ monthly_salary: 3000 }], [], noLabel);
    expect(a.isProfitable).toBe(false);
    expect(a.netProfit).toBeLessThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. PeriodAnalytics output shape matches the financial_entries model
// ─────────────────────────────────────────────────────────────────────────────

describe("analytics output shape matches financial_entries model", () => {
  it("exposes entryRevenue and variableExpenses (not legacy service/movement fields)", () => {
    const dates = ["2026-06-01"];
    const entries = [entry("e1", "day", "2026-06-01", 1234, 56)];
    const a = computeAnalytics(dates, entries, noEmp, noFx, noLabel);

    expect(a).toHaveProperty("entryRevenue", 1234);
    expect(a).toHaveProperty("variableExpenses", 56);

    // Legacy fields must NOT be present
    expect(a).not.toHaveProperty("serviceRevenue");
    expect(a).not.toHaveProperty("movementIncome");
    expect(a).not.toHaveProperty("movementExpenses");
  });

  it("expense breakdown uses new category labels", () => {
    const dates = ["2026-06-01"];
    const entries = [entry("e1", "day", "2026-06-01", 0, 500)];
    const a = computeAnalytics(
      dates,
      entries,
      [{ monthly_salary: 3000 }],
      [{ amount_monthly: 600 }],
      noLabel
    );
    const cats = a.expenseBreakdown.map((c) => c.category);
    expect(cats).toContain("Salários (estimado)");
    expect(cats).toContain("Custos fixos (estimado)");
    expect(cats).toContain("Despesa variável");
  });

  it("revenue breakdown uses 'Receita registada' label when revenue is present", () => {
    const dates = ["2026-06-01"];
    const entries = [entry("e1", "day", "2026-06-01", 2000, 0)];
    const a = computeAnalytics(dates, entries, noEmp, noFx, noLabel);
    expect(a.revenueBreakdown).toHaveLength(1);
    expect(a.revenueBreakdown[0].category).toBe("Receita registada");
    expect(a.revenueBreakdown[0].amount).toBe(2000);
    expect(a.revenueBreakdown[0].pct).toBe(100);
  });

  it("revenue breakdown is empty when there is no revenue", () => {
    const dates = ["2026-06-01"];
    const a = computeAnalytics(dates, [], noEmp, noFx, noLabel);
    expect(a.revenueBreakdown).toHaveLength(0);
  });
});
