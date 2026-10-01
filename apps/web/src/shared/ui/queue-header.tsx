import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { SectionLabel } from "@/shared/ui/section-label";

/**
 * Queue column title (normal-case SectionLabel) + optional mono count / actions.
 * Used at the top of the Queue column in every SplitView.
 */
export function QueueHeader({
  label,
  count,
  actions,
  className,
}: {
  label: string;
  count?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3",
        className
      )}
    >
      <SectionLabel as="span">{label}</SectionLabel>
      <div className="flex items-center gap-2">
        {count === undefined ? null : (
          <span className="text-2xs text-muted-foreground font-mono tabular-nums">
            {count}
          </span>
        )}
        {actions}
      </div>
    </div>
  );
}
