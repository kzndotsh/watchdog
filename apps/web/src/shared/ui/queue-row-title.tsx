import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Primary line in a QueueRow. */
export function QueueRowTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("text-foreground truncate text-sm", className)}>
      {children}
    </span>
  );
}
