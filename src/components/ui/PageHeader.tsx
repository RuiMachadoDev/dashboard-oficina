import { type ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional right-side slot: month pickers, stat badges, back buttons, etc. */
  actions?: ReactNode;
}

/**
 * Consistent page-level heading used on every main page.
 * Renders a flex row with title+subtitle on the left and optional actions on the right.
 */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>
        )}
      </div>
      {actions}
    </div>
  );
}
