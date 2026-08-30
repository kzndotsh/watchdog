import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Muted inline context under split-view queue selection — not labeled MetaRows. */
export function DetailContextStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      data-slot="detail-context-strip"
      className={cn(
        "text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs",
        className
      )}
    >
      {children}
    </p>
  );
}

export function DetailContextSep() {
  return (
    <span aria-hidden className="text-muted-foreground/60 shrink-0">
      ·
    </span>
  );
}

/** First row of split detail — height/border aligned with `QueueHeader`. */
export function DetailContextHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border flex h-10 shrink-0 items-center border-b px-3",
        className
      )}
    >
      <DetailContextStrip className="min-w-0 flex-1 flex-nowrap overflow-hidden">
        {children}
      </DetailContextStrip>
    </div>
  );
}
