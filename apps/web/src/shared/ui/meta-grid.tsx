import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Two-column key/value grid for inspector/drawer metadata.
 */
export function MetaGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="meta-grid"
      className={cn(
        "grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm leading-tight",
        className
      )}
    >
      {children}
    </div>
  );
}
