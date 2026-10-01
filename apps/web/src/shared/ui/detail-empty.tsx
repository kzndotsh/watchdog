import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@watchdog/ui/components/empty";

/**
 * Select-none empty for Detail column — quiet, no dashed frame.
 * Pair with quiet `EmptyState` in the Queue so splits don’t cage both panes.
 */
export function DetailEmpty({
  title = "Select a row",
  description = "Choose a row from the queue to view detail.",
  className,
}: {
  title?: string;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <Empty aria-live="polite" className={cn("h-full", className)}>
      <EmptyHeader>
        <EmptyTitle className="text-muted-foreground">{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
    </Empty>
  );
}
