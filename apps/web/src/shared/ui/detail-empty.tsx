import type { ReactNode } from "react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#ui/components/empty";
import { cn } from "@/lib/utils";

type DetailEmptyProps = {
  title?: string;
  description?: ReactNode;
  className?: string;
};

/**
 * Select-none empty for Detail column — quiet, no dashed frame.
 * Pair with quiet `EmptyState` in the Queue so splits don’t cage both panes.
 */
export function DetailEmpty({
  title = "Select a row",
  description = "Choose a row from the queue to view detail.",
  className,
}: DetailEmptyProps) {
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
