import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { pt } from "react-day-picker/locale";
import * as Popover from "@radix-ui/react-popover";
import { Calendar } from "lucide-react";

/** Parse a YYYY-MM-DD string into a local Date (no UTC shift). */
function parseYMD(ymd: string): Date | undefined {
  if (!ymd) return undefined;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

/** Serialize a Date to YYYY-MM-DD using local time. */
function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const fmtPT = new Intl.DateTimeFormat("pt-PT", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

interface DatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
  /** "default" — standard form size; "compact" — matches inline table input height */
  size?: "default" | "compact";
}

export function DatePicker({
  value,
  onChange,
  disabled = false,
  className = "",
  size = "default",
}: DatePickerProps) {
  const [open, setOpen] = useState(false);

  const selected = parseYMD(value);
  const isCompact = size === "compact";

  const label = selected
    ? isCompact
      ? selected.toLocaleDateString("pt-PT")
      : fmtPT.format(selected)
    : "Selecionar data";

  function handleSelect(day: Date | undefined) {
    if (!day) return;
    onChange(toYMD(day));
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={disabled ? undefined : setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={
            isCompact
              ? `inline-flex w-full items-center gap-1.5 rounded-lg border bg-white px-2 py-1 text-xs text-left transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 ${className}`
              : `inline-flex w-full items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm text-left transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:opacity-50 ${className}`
          }
        >
          <Calendar size={isCompact ? 12 : 14} strokeWidth={1.75} className="shrink-0 text-zinc-400" />
          <span className={selected ? "text-zinc-900" : "text-zinc-400"}>
            {label}
          </span>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-50 rounded-2xl border bg-white p-3 shadow-lg"
        >
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            defaultMonth={selected}
            locale={pt}
            weekStartsOn={1}
            classNames={{
              root: "text-sm text-zinc-900",
              months: "flex flex-col",
              month: "space-y-3",
              month_caption: "flex items-center justify-between px-1",
              caption_label: "text-sm font-semibold capitalize",
              nav: "flex items-center gap-1",
              button_previous:
                "flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700",
              button_next:
                "flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700",
              month_grid: "w-full border-collapse",
              weekdays: "flex",
              weekday:
                "flex-1 py-1 text-center text-[11px] font-medium text-zinc-400",
              week: "flex mt-1",
              day: "flex-1 text-center",
              day_button:
                "mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors hover:bg-zinc-100",
              selected:
                "[&>button]:bg-zinc-900 [&>button]:!text-white [&>button]:hover:bg-zinc-800",
              today: "[&>button]:font-bold [&>button]:text-zinc-900",
              outside: "[&>button]:text-zinc-300",
              disabled: "[&>button]:opacity-30 [&>button]:cursor-not-allowed",
            }}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
