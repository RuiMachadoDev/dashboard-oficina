import { describe, it, expect } from "vitest";
import {
  buildCostPerHourMap,
  calcCusto,
  calcFaturado,
  calcLucroLiquido,
  calcMargemMO,
} from "./finance";
import type {
  Employee,
  TimeEntry,
} from "../types";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeEmployee(
  id: string,
  monthly_salary: number,
  monthly_hours: number
): Employee {
  return { id, name: "", role: "", monthly_salary, monthly_hours, created_at: "" };
}

function makeEntry(
  employee_id: string,
  hours: number
): Pick<TimeEntry, "hours" | "employee_id"> {
  return { employee_id, hours };
}

// ─── buildCostPerHourMap ─────────────────────────────────────────────────────

describe("buildCostPerHourMap", () => {
  it("returns the correct cost per hour", () => {
    const map = buildCostPerHourMap([makeEmployee("e1", 1200, 160)]);
    expect(map.get("e1")).toBeCloseTo(7.5);
  });

  it("returns 0 when monthly_hours is zero (avoids division by zero)", () => {
    const map = buildCostPerHourMap([makeEmployee("e1", 1200, 0)]);
    expect(map.get("e1")).toBe(0);
  });

  it("handles multiple employees independently", () => {
    const map = buildCostPerHourMap([
      makeEmployee("e1", 800, 160),
      makeEmployee("e2", 1600, 160),
    ]);
    expect(map.get("e1")).toBeCloseTo(5);
    expect(map.get("e2")).toBeCloseTo(10);
  });
});

// ─── calcFaturado ────────────────────────────────────────────────────────────

describe("calcFaturado", () => {
  it("multiplies total hours by hourly rate", () => {
    expect(calcFaturado(8, 31)).toBeCloseTo(248);
  });

  it("returns 0 for zero hours", () => {
    expect(calcFaturado(0, 31)).toBe(0);
  });

  it("handles fractional hours", () => {
    expect(calcFaturado(2.5, 40)).toBeCloseTo(100);
  });
});

// ─── calcCusto ───────────────────────────────────────────────────────────────

describe("calcCusto", () => {
  it("sums cost across multiple employees at their individual rates", () => {
    const map = buildCostPerHourMap([
      makeEmployee("e1", 800, 160),   // €5/h
      makeEmployee("e2", 1600, 160),  // €10/h
    ]);
    const entries = [
      makeEntry("e1", 4),  // 4 × 5  = 20
      makeEntry("e2", 3),  // 3 × 10 = 30
    ];
    expect(calcCusto(entries, map)).toBeCloseTo(50);
  });

  it("uses 0 for an employee not present in the cost map", () => {
    const map = buildCostPerHourMap([makeEmployee("e1", 800, 160)]);
    const entries = [makeEntry("unknown", 10)];
    expect(calcCusto(entries, map)).toBe(0);
  });

  it("returns 0 for an empty entry list", () => {
    const map = buildCostPerHourMap([makeEmployee("e1", 800, 160)]);
    expect(calcCusto([], map)).toBe(0);
  });
});

// ─── calcMargemMO ────────────────────────────────────────────────────────────

describe("calcMargemMO", () => {
  it("returns the difference between billed and cost", () => {
    expect(calcMargemMO(200, 80)).toBeCloseTo(120);
  });

  it("returns a negative value when cost exceeds billed", () => {
    expect(calcMargemMO(50, 80)).toBeCloseTo(-30);
  });
});

// ─── calcLucroLiquido ────────────────────────────────────────────────────────

describe("calcLucroLiquido", () => {
  it("returns a positive profit when revenue exceeds costs", () => {
    expect(calcLucroLiquido(1000, 400, 200)).toBeCloseTo(400);
  });

  it("returns a negative value when costs exceed revenue", () => {
    expect(calcLucroLiquido(500, 400, 200)).toBeCloseTo(-100);
  });

  it("returns zero when revenue exactly covers costs", () => {
    expect(calcLucroLiquido(600, 400, 200)).toBeCloseTo(0);
  });

  it("includes material billed and material cost when provided", () => {
    // labor: 1000 billed, 400 cost → +600
    // material: 500 billed, 200 cost → +300
    // fixed: 200
    // net: 600 + 300 - 200 = 700
    expect(calcLucroLiquido(1000, 400, 200, 500, 200)).toBeCloseTo(700);
  });

  it("material params default to 0 (backwards compatible)", () => {
    expect(calcLucroLiquido(1000, 400, 200)).toBeCloseTo(400);
  });

  it("returns negative when material cost exceeds material billed", () => {
    // labor margin = 600, material loss = -100, fixed = 200 → 300
    expect(calcLucroLiquido(1000, 400, 200, 100, 200)).toBeCloseTo(300);
  });
});
