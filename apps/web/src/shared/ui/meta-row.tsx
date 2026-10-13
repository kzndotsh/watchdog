import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type MetaRowProps = {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  labelClassName?: string;
};

/**
 * Label + value definition row. Presentational only.
 */
export function MetaRow({
  label,
  children,
  className,
  labelClassName,
}: MetaRowProps) {
  return (
    <div
      data-slot="meta-row"
      className={cn("flex min-w-0 items-center gap-2 text-xs", className)}
    >
      <span className={cn("text-muted-foreground shrink-0", labelClassName)}>
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
