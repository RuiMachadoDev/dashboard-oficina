import { type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

/**
 * Standard form input: w-full rounded-xl border px-3 py-2 text-sm with focus ring.
 * For inline table edits (rounded-lg text-xs) keep the existing Tailwind classes — those
 * are intentionally smaller and are NOT replaced by this component.
 * Pass className to add spacing (e.g. "mt-1") or width overrides.
 */
export function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200 ${className}`}
      {...props}
    />
  );
}
