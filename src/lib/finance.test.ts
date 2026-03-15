import { describe, it, expect } from "vitest";
import {
  buildCostPerHourMap,
  calcFaturado,
  calcCusto,
  calcLucroLiquido,
  filterServiceIdsByMonth,
} from "./finance";
import type { Employee, Service, TimeEntry } from "../types";

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

function makeService(id: string, service_date: string): Pick<Service, "id" | "service_date"> {
  return { id, service_date };
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
});

// ─── filterServiceIdsByMonth ─────────────────────────────────────────────────

describe("filterServiceIdsByMonth", () => {
  const services = [
    makeService("s1", "2025-03-10"),
    makeService("s2", "2025-03-31"),
    makeService("s3", "2025-04-01"),
    makeService("s4", "2025-02-28"),
  ];

  it("returns only IDs whose service_date falls in the given month", () => {
    const ids = filterServiceIdsByMonth(services, "2025-03");
    expect(ids).toEqual(new Set(["s1", "s2"]));
  });

  it("returns an empty set when no services match the month", () => {
    const ids = filterServiceIdsByMonth(services, "2025-01");
    expect(ids.size).toBe(0);
  });

  it("correctly isolates a single-service month", () => {
    const ids = filterServiceIdsByMonth(services, "2025-04");
    expect(ids).toEqual(new Set(["s3"]));
  });
});
