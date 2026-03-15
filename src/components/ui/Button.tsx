import { type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary";
type Size = "md" | "sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const CLASSES: Record<Variant, Record<Size, string>> = {
  primary: {
    md: "rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60",
    sm: "rounded-lg bg-zinc-900 px-3 py-1 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60",
  },
  secondary: {
    md: "rounded-xl border bg-white px-3 py-2 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-60",
    sm: "rounded-lg border px-2 py-1 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-60",
  },
};

/**
 * Variants: "primary" (zinc-900 fill) | "secondary" (outline).
 * Sizes: "md" (default form buttons) | "sm" (table row actions).
 * Pass className to add layout utilities (e.g. "w-full", "inline-flex").
 */
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button className={`${CLASSES[variant][size]} ${className}`} {...props} />
  );
}
