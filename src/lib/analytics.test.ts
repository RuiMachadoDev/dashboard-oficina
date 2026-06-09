import { describe, it, expect } from "vitest";
import { computeAnalytics } from "./analytics";
import type { FinancialEntry } from "../types";
import { getISOWeek, getMonthDays, getWeekDays, getYearMonths } from "./dates";
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
// 5. Structural costs — calendar-day proration
// ─────────────────────────────────────────────────────────────────────────────

describe("structural costs: calendar-day proration", () => {
  it("prorates monthly salary by calendar days (1 day in a 30-day month)", () => {
    // June 2026 = 30 days; 3000 / 30 = 100
    const a = computeAnalytics(["2026-06-01"], [], [{ monthly_salary: 3000 }], [], noLabel);
    expect(a.salaryCost).toBe(100);
  });

  it("prorates fixed expenses by calendar days (1 day in a 30-day month)", () => {
    // June 2026 = 30 days; 1500 / 30 = 50
    const a = computeAnalytics(["2026-06-01"], [], [], [{ amount_monthly: 1500 }], noLabel);
    expect(a.fixedCost).toBe(50);
  });

  it("accumulates structural cost correctly across a 7-day week", () => {
    // June 2026 = 30 days; 3000 / 30 × 7 = 700
    const { year, week } = getISOWeek("2026-06-01");
    const dates = getWeekDays(year, week);
    const a = computeAnalytics(dates, [], [{ monthly_salary: 3000 }], [], noLabel);
    expect(a.salaryCost).toBe(700);
  });

  it("full calendar month salary cost equals the configured monthly amount", () => {
    const allDays = getMonthDays("2026-06"); // 30 days
    const a = computeAnalytics(allDays, [], [{ monthly_salary: 3000 }], [], noLabel);
    expect(a.salaryCost).toBeCloseTo(3000, 5);
  });

  it("full calendar month fixed cost equals the configured monthly amount", () => {
    const allDays = getMonthDays("2026-06");
    const a = computeAnalytics(allDays, [], [], [{ amount_monthly: 1800 }], noLabel);
    expect(a.fixedCost).toBeCloseTo(1800, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Net profit formula
// ─────────────────────────────────────────────────────────────────────────────

describe("net profit = revenue − variable expenses − structural costs", () => {
  it("computes net profit correctly for a single day with all cost types", () => {
    // June 2026 = 30 days
    // Salary:  3000 / 30 = 100, Fixed: 1500 / 30 = 50, Variable: 300
    // Net: 2000 − 300 − 100 − 50 = 1550
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
    expect(cats).toContain("Salários");
    expect(cats).toContain("Despesas fixas");
    expect(cats).toContain("Despesas variáveis");
  });

  it("revenue breakdown uses 'Receita registada' label when revenue is present", () => {
    const dates = ["2026-06-01"];
    const entries = [entry("e1", "day", "2026-06-01", 2000, 0)];
    const a = computeAnalytics(dates, entries, noEmp, noFx, noLabel);
    expect(a.revenueBreakdown).toHaveLength(1);
    expect(a.revenueBreakdown[0].category).toBe("Ganhos");
    expect(a.revenueBreakdown[0].amount).toBe(2000);
    expect(a.revenueBreakdown[0].pct).toBe(100);
  });

  it("revenue breakdown is empty when there is no revenue", () => {
    const dates = ["2026-06-01"];
    const a = computeAnalytics(dates, [], noEmp, noFx, noLabel);
    expect(a.revenueBreakdown).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Full-month January 2026 — formula verification
//
// January 2026 has 31 days.
// salary 3 000 / 31 days × 31 = 3 000
// fixed  1 500 / 31 days × 31 = 1 500
// ─────────────────────────────────────────────────────────────────────────────

describe("full month January 2026 — formula verification", () => {
  const jan = getMonthDays("2026-01"); // 31 days
  const salary = 3000;
  const fixed  = 1500;
  const emp  = [{ monthly_salary: salary }];
  const fx   = [{ amount_monthly: fixed }];

  it("salary cost equals the full monthly salary for the complete month", () => {
    const a = computeAnalytics(jan, [], emp, [], noLabel);
    expect(a.salaryCost).toBeCloseTo(salary, 4);
  });

  it("fixed cost equals the full monthly fixed expense for the complete month", () => {
    const a = computeAnalytics(jan, [], [], fx, noLabel);
    expect(a.fixedCost).toBeCloseTo(fixed, 4);
  });

  it("multiple daily gain entries aggregate correctly", () => {
    const entries = [
      entry("g1", "day", "2026-01-08", 3500, 0),
      entry("g2", "day", "2026-01-15", 4200, 0),
      entry("g3", "day", "2026-01-22", 2800, 0),
    ];
    const a = computeAnalytics(jan, entries, noEmp, noFx, noLabel);
    expect(a.entryRevenue).toBe(10500);
    expect(a.variableExpenses).toBe(0);
  });

  it("multiple daily loss entries aggregate correctly", () => {
    const entries = [
      entry("l1", "day", "2026-01-05", 0, 800),
      entry("l2", "day", "2026-01-12", 0, 600),
      entry("l3", "day", "2026-01-20", 0, 400),
    ];
    const a = computeAnalytics(jan, entries, noEmp, noFx, noLabel);
    expect(a.entryRevenue).toBe(0);
    expect(a.variableExpenses).toBe(1800);
  });

  it("net result = gains − var.expenses − salaries − fixed expenses", () => {
    // gains = 3500 + 4200 + 2800 = 10 500
    // losses = 800 + 600 + 400  = 1 800
    // net = 10 500 − 1 800 − 3 000 − 1 500 = 4 200
    const entries = [
      entry("g1", "day", "2026-01-08", 3500, 0),
      entry("g2", "day", "2026-01-15", 4200, 0),
      entry("g3", "day", "2026-01-22", 2800, 0),
      entry("l1", "day", "2026-01-05", 0, 800),
      entry("l2", "day", "2026-01-12", 0, 600),
      entry("l3", "day", "2026-01-20", 0, 400),
    ];
    const a = computeAnalytics(jan, entries, emp, fx, noLabel);
    expect(a.entryRevenue).toBe(10500);
    expect(a.variableExpenses).toBe(1800);
    expect(a.salaryCost).toBeCloseTo(salary, 4);
    expect(a.fixedCost).toBeCloseTo(fixed, 4);
    expect(a.totalExpenses).toBeCloseTo(1800 + salary + fixed, 4);
    expect(a.netProfit).toBeCloseTo(10500 - 1800 - salary - fixed, 4);
    expect(a.isProfitable).toBe(true);
  });

  it("correctly reports unprofitable when costs exceed gains", () => {
    const entries = [entry("g1", "day", "2026-01-10", 1000, 0)];
    const a = computeAnalytics(jan, entries, emp, fx, noLabel);
    // 1000 − 0 − 3000 − 1500 = −3500
    expect(a.netProfit).toBeCloseTo(1000 - salary - fixed, 4);
    expect(a.isProfitable).toBe(false);
  });

  it("entries on days outside January are not counted", () => {
    const entries = [
      entry("g1", "day", "2026-01-15", 5000, 0),
      entry("g2", "day", "2026-02-01", 9999, 0), // outside period
    ];
    const a = computeAnalytics(jan, entries, noEmp, noFx, noLabel);
    expect(a.entryRevenue).toBe(5000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Weekly view — proportional structural costs within a month
// ─────────────────────────────────────────────────────────────────────────────

describe("weekly view: proportional structural costs", () => {
  // January 2026 has 31 days. Week of Jan 5 (Mon) → Jan 11 (Sun) = 7 days.
  const { year, week } = getISOWeek("2026-01-05");
  const weekDates = getWeekDays(year, week);

  it("salary for one full week in Jan = monthly / 31 × 7", () => {
    const a = computeAnalytics(weekDates, [], [{ monthly_salary: 3100 }], [], noLabel);
    expect(a.salaryCost).toBeCloseTo(3100 * 7 / 31, 4);
  });

  it("fixed expense for one full week in Jan = monthly / 31 × 7", () => {
    const a = computeAnalytics(weekDates, [], [], [{ amount_monthly: 1550 }], noLabel);
    expect(a.fixedCost).toBeCloseTo(1550 * 7 / 31, 4);
  });

  it("net result for a week is gains − losses − proportional structural", () => {
    const gains  = 2000;
    const losses = 300;
    const monthlySalary = 3100;
    const monthlyFixed  = 1550;
    const entries = [
      entry("g", "day", weekDates[0], gains, 0),
      entry("l", "day", weekDates[2], 0, losses),
    ];
    const a = computeAnalytics(
      weekDates,
      entries,
      [{ monthly_salary: monthlySalary }],
      [{ amount_monthly: monthlyFixed }],
      noLabel
    );
    const expectedSalary = round2(monthlySalary * 7 / 31);
    const expectedFixed  = round2(monthlyFixed  * 7 / 31);
    expect(a.entryRevenue).toBe(gains);
    expect(a.variableExpenses).toBe(losses);
    expect(a.salaryCost).toBeCloseTo(expectedSalary, 4);
    expect(a.fixedCost).toBeCloseTo(expectedFixed, 4);
    expect(a.netProfit).toBeCloseTo(gains - losses - expectedSalary - expectedFixed, 4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Yearly aggregation — 12 months sum to annual totals
// ─────────────────────────────────────────────────────────────────────────────

describe("yearly aggregation: 12 months sum to annual totals", () => {
  const months2026 = getYearMonths(2026);

  it("salary across all 12 months equals 12 × monthly salary", () => {
    const monthlySalary = 3000;
    let totalSalary = 0;
    for (const ym of months2026) {
      const days = getMonthDays(ym);
      const a = computeAnalytics(days, [], [{ monthly_salary: monthlySalary }], [], noLabel);
      totalSalary = round2(totalSalary + a.salaryCost);
    }
    expect(totalSalary).toBeCloseTo(monthlySalary * 12, 2);
  });

  it("fixed expenses across all 12 months equals 12 × monthly fixed", () => {
    const monthlyFixed = 1500;
    let totalFixed = 0;
    for (const ym of months2026) {
      const days = getMonthDays(ym);
      const a = computeAnalytics(days, [], [], [{ amount_monthly: monthlyFixed }], noLabel);
      totalFixed = round2(totalFixed + a.fixedCost);
    }
    expect(totalFixed).toBeCloseTo(monthlyFixed * 12, 2);
  });

  it("revenue and variable expenses aggregate correctly across multiple months", () => {
    // One gain entry per month, one loss entry per month
    const entries: FinancialEntry[] = months2026.flatMap((ym, i) => [
      entry(`g${i}`, "day", `${ym}-10`, 5000, 0),
      entry(`l${i}`, "day", `${ym}-20`, 0,    800),
    ]);

    let totalGains  = 0;
    let totalLosses = 0;

    for (const ym of months2026) {
      const days = getMonthDays(ym);
      const a = computeAnalytics(days, entries, noEmp, noFx, noLabel);
      totalGains  = round2(totalGains  + a.entryRevenue);
      totalLosses = round2(totalLosses + a.variableExpenses);
    }

    expect(totalGains).toBe(5000 * 12);
    expect(totalLosses).toBe(800 * 12);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. totalCosts = variableExpenses + salaryCost + fixedCost
// ─────────────────────────────────────────────────────────────────────────────

describe("totalCosts = variableExpenses + salaryCost + fixedCost", () => {
  it("totalCosts equals the sum of all three cost components", () => {
    const dates = ["2026-06-01"];
    const entries = [entry("e1", "day", "2026-06-01", 0, 400)]; // variable 400
    // June = 30 days; salary/30 = 100; fixed/30 = 50
    const a = computeAnalytics(
      dates,
      entries,
      [{ monthly_salary: 3000 }],
      [{ amount_monthly: 1500 }],
      noLabel
    );
    expect(a.totalCosts).toBeCloseTo(a.variableExpenses + a.salaryCost + a.fixedCost, 4);
    expect(a.totalCosts).toBe(a.totalExpenses);
  });

  it("totalCosts equals totalExpenses in all cases", () => {
    const dates = ["2026-01-15"];
    const entries = [entry("e1", "day", "2026-01-15", 1000, 250)];
    const a = computeAnalytics(
      dates,
      entries,
      [{ monthly_salary: 2500 }],
      [{ amount_monthly: 800 }],
      noLabel
    );
    expect(a.totalCosts).toBe(a.totalExpenses);
  });

  it("full January: totalCosts = variableExpenses + full salary + full fixed", () => {
    const jan = getMonthDays("2026-01"); // 31 days
    const salary = 3000;
    const fixed  = 1500;
    const entries = [
      entry("g1", "day", "2026-01-08", 5000, 0),
      entry("l1", "day", "2026-01-15", 0, 800),
    ];
    const a = computeAnalytics(
      jan,
      entries,
      [{ monthly_salary: salary }],
      [{ amount_monthly: fixed }],
      noLabel
    );
    expect(a.variableExpenses).toBe(800);
    expect(a.salaryCost).toBeCloseTo(salary, 4);
    expect(a.fixedCost).toBeCloseTo(fixed, 4);
    expect(a.totalCosts).toBeCloseTo(800 + salary + fixed, 4);
    expect(a.netProfit).toBeCloseTo(5000 - a.totalCosts, 4);
  });

  it("zero costs when no employees, no fixed expenses, and no variable entries", () => {
    const dates = ["2026-06-01", "2026-06-02"];
    const entries = [entry("e1", "day", "2026-06-01", 500, 0)];
    const a = computeAnalytics(dates, entries, noEmp, noFx, noLabel);
    expect(a.variableExpenses).toBe(0);
    expect(a.salaryCost).toBe(0);
    expect(a.fixedCost).toBe(0);
    expect(a.totalCosts).toBe(0);
    expect(a.netProfit).toBe(500);
  });

  it("yearly aggregation: totalCosts sums correctly across 12 months", () => {
    const months2026 = getYearMonths(2026);
    const salary = 3000;
    const fixed  = 1200;
    const entries: FinancialEntry[] = months2026.map((ym, i) =>
      entry(`l${i}`, "day", `${ym}-10`, 0, 500)
    );

    let yearTotalCosts = 0;
    for (const ym of months2026) {
      const days = getMonthDays(ym);
      const a = computeAnalytics(
        days,
        entries,
        [{ monthly_salary: salary }],
        [{ amount_monthly: fixed }],
        noLabel
      );
      yearTotalCosts = round2(yearTotalCosts + a.totalCosts);
    }

    // variable = 500 × 12 = 6000, salary = 3000 × 12 = 36000, fixed = 1200 × 12 = 14400
    expect(yearTotalCosts).toBeCloseTo(500 * 12 + salary * 12 + fixed * 12, 1);
  });
});
