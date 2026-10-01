import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { SectionLabel } from "@/shared/ui/section-label";
import { TabCount } from "@/shared/ui/tab-count";

type SectionHeaderBarVariant = "sticky" | "panel" | "inline";

/**
 * Title on the left; count pill (same `TabCount` as the page header) and optional action on the right.
 * Presentational only.
 */
export function SectionHeaderBar({
  title,
  count,
  action,
  variant = "inline",
  className,
  as = "h3",
}: {
  title: ReactNode;
  count?: number;
  action?: ReactNode;
  variant?: SectionHeaderBarVariant;
  className?: string;
  as?: ElementType;
}) {
  return (
    <div
      data-slot="section-header-bar"
      data-variant={variant}
      className={cn(
        "flex items-center justify-between gap-2",
        variant === "sticky" &&
          // top-10 = QueueHeader h-10 — day strips stick under the queue title.
          "border-border bg-sidebar sticky top-10 z-10 border-b px-3 py-1.5",
        variant === "panel" && "border-border bg-muted/30 border-b px-3 py-1.5",
        variant === "inline" && "flex-wrap items-baseline",
        className
      )}
    >
      <SectionLabel
        as={as}
        density={variant === "panel" ? "compact" : "default"}
      >
        {title}
      </SectionLabel>
      {typeof count === "number" || action ? (
        <div className="flex shrink-0 items-center gap-2">
          {typeof count === "number" ? (
            <TabCount n={count} className="ml-0" />
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
