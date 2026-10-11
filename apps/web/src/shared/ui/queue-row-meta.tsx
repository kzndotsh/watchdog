import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Secondary muted cluster under the title. */
export function QueueRowMeta({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-2xs text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 font-mono",
        className
      )}
    >
      {children}
    </span>
  );
}
