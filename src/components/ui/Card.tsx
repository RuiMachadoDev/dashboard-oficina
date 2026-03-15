import { type HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {}

/**
 * Standard content card: rounded-2xl border bg-white p-5 shadow-sm
 * Pass className to append layout/spacing overrides (e.g. "lg:col-span-2", "max-w-xl").
 */
export function Card({ className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm ${className}`}
      {...props}
    />
  );
}
