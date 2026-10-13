import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  STATUS_GLYPH,
  STATUS_LABELS,
  STATUS_TONES,
  type DisplayStatus,
} from "@/shared/ui/vocab/status.lib";

type StatusInkProps = {
  status: DisplayStatus;
  pulse?: boolean;
  className?: string;
  children?: ReactNode;
};

/** Status as glyph + colored word — no pill. Use in Detail context strips. */
export function StatusInk({
  status,
  pulse = false,
  className,
  children,
}: StatusInkProps) {
  const { icon: Icon, color } = STATUS_GLYPH[status];
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <span
        aria-hidden
        className={cn(
          "inline-flex size-3 shrink-0",
          color,
          pulse && status === "running" && "animate-spin"
        )}
      >
        <Icon className="size-3" strokeWidth={2.25} />
      </span>
      <span
        className={cn("truncate", STATUS_TONES[status].low, "bg-transparent")}
      >
        {children ?? STATUS_LABELS[status]}
      </span>
    </span>
  );
}
