import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Muted inline context under split-view queue selection — not labeled MetaRows. */
export function DetailContextLine({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="detail-context-line"
      className={cn(
        "text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs",
        className
      )}
    >
      {children}
    </div>
  );
}
