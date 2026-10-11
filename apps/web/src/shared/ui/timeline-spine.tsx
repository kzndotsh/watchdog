import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Vertical spine (`border-l`) for timeline-style lists — events, questions, activity.
 * Callers use `pl-4` (the spacing `TimelineDot`'s offset assumes) and own the
 * border color via `className`.
 */
export function TimelineSpine({
  children,
  className,
  dashed = true,
}: {
  children: ReactNode;
  className?: string;
  dashed?: boolean;
}) {
  return (
    <div
      className={cn(
        "border-border relative border-l",
        dashed && "border-dashed",
        className
      )}
    >
      {children}
    </div>
  );
}
