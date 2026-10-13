import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type TimelineSpineProps = {
  children: ReactNode;
  className?: string;
  isDashed?: boolean;
};

/**
 * Vertical spine (`border-l`) for timeline-style lists — events, questions, activity.
 * Callers use `pl-4` (the spacing `TimelineDot`'s offset assumes) and own the
 * border color via `className`.
 */
export function TimelineSpine({
  children,
  className,
  isDashed = true,
}: TimelineSpineProps) {
  return (
    <div
      className={cn(
        "border-border relative border-l",
        isDashed && "border-dashed",
        className
      )}
    >
      {children}
    </div>
  );
}
