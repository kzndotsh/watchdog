import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Label + value definition row. Presentational only.
 */
export function MetaRow({
  label,
  children,
  className,
  labelClassName,
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
  labelClassName?: string;
}) {
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

/**
 * Two-column key/value grid for inspector/drawer metadata.
 */
export function MetaGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="meta-grid"
      className={cn(
        "text-label grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Grid cell pair used inside MetaGrid. */
export function MetaGridItem({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </>
  );
}
