export const PT_MONTHS_SHORT = [
  "Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez",
];

export const PT_MONTHS_LONG = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export const PT_DAYS_SHORT = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

// ── Simple helpers ────────────────────────────────────────────────────────────

export function todayYM(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function ymFromDateISO(dateISO: string): string {
  return dateISO.slice(0, 7);
}

export function addMonths(ym: string, delta: number): string {
  const [yStr, mStr] = ym.split("-");
  const d = new Date(Number(yStr), Number(mStr) - 1, 1);
  d.setMonth(d.getMonth() + delta);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

export function monthStartISO(ym: string): string {
  return `${ym}-01`;
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

// ── Month helpers ─────────────────────────────────────────────────────────────

/** All YYYY-MM-DD dates in a given month. */
export function getMonthDays(ym: string): string[] {
  const [y, m] = ym.split("-").map(Number);
  const total = daysInMonth(ym);
  const result: string[] = [];
  for (let d = 1; d <= total; d++) {
    result.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return result;
}

/** All YYYY-MM strings for a given year. */
export function getYearMonths(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, "0")}`
  );
}

export function formatYM(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${PT_MONTHS_LONG[m - 1]} ${y}`;
}

// ── ISO week helpers ──────────────────────────────────────────────────────────

/**
 * Returns the ISO week number and ISO week-year for a given date.
 * Uses noon UTC to avoid DST-induced date shifts.
 */
export function getISOWeek(dateISO: string): { year: number; week: number } {
  const d = new Date(dateISO + "T12:00:00Z");
  const dayOfWeek = d.getUTCDay() || 7; // 1=Mon … 7=Sun
  // Shift to the nearest Thursday (ISO week definition)
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/** Returns the ISO week for today. */
export function currentISOWeek(): { year: number; week: number } {
  return getISOWeek(todayISO());
}

/**
 * Returns the Monday (ISO start) of a given ISO week as YYYY-MM-DD.
 * Jan 4 is always in week 1.
 */
export function getWeekStart(year: number, week: number): string {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const week1Mon = new Date(jan4.getTime());
  week1Mon.setUTCDate(jan4.getUTCDate() - jan4Dow + 1);
  const target = new Date(week1Mon.getTime());
  target.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
  return isoFromUTC(target);
}

/** Returns all 7 dates (Mon–Sun) for an ISO week as YYYY-MM-DD strings. */
export function getWeekDays(year: number, week: number): string[] {
  const monday = getWeekStart(year, week);
  const base = new Date(monday + "T12:00:00Z");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getTime() + i * 86_400_000);
    return isoFromUTC(d);
  });
}

/** Navigate ±N weeks. */
export function shiftWeek(
  year: number,
  week: number,
  delta: number
): { year: number; week: number } {
  const monday = getWeekStart(year, week);
  const d = new Date(monday + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta * 7);
  return getISOWeek(isoFromUTC(d));
}

/** Human-readable label, e.g. "2–8 Jun 2025" or "30 Jun – 6 Jul 2025". */
export function formatWeekRange(year: number, week: number): string {
  const days = getWeekDays(year, week);
  const start = new Date(days[0] + "T12:00:00Z");
  const end = new Date(days[6] + "T12:00:00Z");
  const sm = PT_MONTHS_SHORT[start.getUTCMonth()];
  const em = PT_MONTHS_SHORT[end.getUTCMonth()];
  const ey = end.getUTCFullYear();
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${start.getUTCDate()}–${end.getUTCDate()} ${sm} ${ey}`;
  }
  return `${start.getUTCDate()} ${sm} – ${end.getUTCDate()} ${em} ${ey}`;
}

/** Short day label for charts, e.g. "Seg 2". */
export function dayChartLabel(dateISO: string): string {
  const d = new Date(dateISO + "T12:00:00Z");
  return `${PT_DAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()}`;
}

// ── Internal ──────────────────────────────────────────────────────────────────

function isoFromUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
