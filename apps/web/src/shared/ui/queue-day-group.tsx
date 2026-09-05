import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { SectionHeaderBar } from "@/shared/ui/section-header-bar";

/**
 * One day bucket in a Queue list — sticky label + count + row list.
 * Presentational only.
 */
export function QueueDayGroup({
  label,
  count,
  children,
  className,
  listClassName,
  listLabel,
  headerVariant = "sticky",
}: {
  label: ReactNode;
  count?: number;
  children: ReactNode;
  className?: string;
  listClassName?: string;
  /** Optional aria-label for the inner ul (parent listbox usually owns it). */
  listLabel?: string;
  /** `panel` for skeletons in a clipped pane — sticky day bars overlap rows. */
  headerVariant?: "sticky" | "panel";
}) {
  return (
    <section
      className={cn("border-border border-b last:border-b-0", className)}
    >
      <SectionHeaderBar
        variant={headerVariant}
        title={label}
        count={count}
        as="h3"
      />
      <ul
        className={cn("divide-border divide-y", listClassName)}
        aria-label={listLabel}
      >
        {children}
      </ul>
    </section>
  );
}
