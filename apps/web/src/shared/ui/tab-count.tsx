import type { ReactElement } from "react";

import { cn } from "@/lib/utils";

type TabCountProps = {
  /**
   * A number (hidden at 0), or a list's `<ListCount variant="compact" isLive={false} />`, which
   * hides the pill while the list has no rows ("1,000+" once it has).
   */
  n: number | ReactElement;
  className?: string;
};

/** Compact count pill for tab labels and PageHeader last-crumb totals. */
export function TabCount({ n, className }: TabCountProps) {
  if (n === 0) return null;
  return (
    <span
      data-slot="tab-count"
      className={cn(
        "bg-secondary text-2xs text-secondary-foreground ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 font-mono tabular-nums",
        // An empty ListCount (pending, no rows) hides the pill, as 0 does.
        "has-[[data-slot=list-count][data-empty]]:hidden",
        className
      )}
    >
      {n}
    </span>
  );
}

TabCount.displayName = "TabCount";
