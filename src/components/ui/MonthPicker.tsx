import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril",
  "Maio", "Junho", "Julho", "Agosto",
  "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Format "YYYY-MM" → "Março 2026" */
function formatYM(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_PT[m - 1]} ${y}`;
}

/** Shift a "YYYY-MM" string by delta months, returning a new "YYYY-MM". */
function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

interface MonthPickerProps {
  /** Current value in YYYY-MM format */
  value: string;
  /** Called with the new YYYY-MM string whenever the month changes */
  onChange: (v: string) => void;
  /** Label rendered above the control. Defaults to "Mês". Pass null to hide. */
  label?: string | null;
  className?: string;
}

/**
 * A lightweight month navigation control.
 * Replaces <input type="month"> with a polished prev/next picker
 * that stays consistent with the app's zinc visual language.
 *
 * The external value/onChange contract is identical to a native month input:
 * value is always "YYYY-MM", onChange receives a "YYYY-MM" string.
 */
export function MonthPicker({
  value,
  onChange,
  label = "Mês",
  className = "",
}: MonthPickerProps) {
  return (
    <div className={className}>
      {label != null && (
        <div className="mb-1 text-xs font-medium text-zinc-500">{label}</div>
      )}

      <div className="inline-flex items-stretch overflow-hidden rounded-xl border bg-white shadow-sm">
        <button
          type="button"
          onClick={() => onChange(shiftMonth(value, -1))}
          aria-label="Mês anterior"
          className="flex items-center px-2 text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-zinc-700"
        >
          <ChevronLeft size={14} strokeWidth={2} />
        </button>

        <span className="flex w-[120px] select-none items-center justify-center px-1 py-2 text-sm font-medium text-zinc-800">
          {formatYM(value)}
        </span>

        <button
          type="button"
          onClick={() => onChange(shiftMonth(value, 1))}
          aria-label="Próximo mês"
          className="flex items-center px-2 text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-zinc-700"
        >
          <ChevronRight size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
