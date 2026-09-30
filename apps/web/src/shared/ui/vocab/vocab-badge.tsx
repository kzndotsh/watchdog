import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { CHIP_SIZE_CLASS } from "@/shared/ui/detail-status-chip";
import { Badge } from "@watchdog/ui/components/badge";

type BadgeSize = "sm" | "md";

export interface VocabTone {
  low: string;
  high: string;
}

type VocabBadgeProps = Omit<ComponentProps<typeof Badge>, "variant"> & {
  label: string;
  tone: VocabTone;
  contrast?: "low" | "high";
  size?: BadgeSize;
};

/**
 * Presentational badge shell — label + semantic tone classes.
 * Per-vocab wrappers supply exhaustive maps; do not invent tones here.
 * Size chrome shared with `DetailStatusChip` via `CHIP_SIZE_CLASS`.
 */
export function VocabBadge({
  label,
  tone,
  contrast = "low",
  size = "sm",
  className,
  children,
  ...props
}: VocabBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        CHIP_SIZE_CLASS[size],
        contrast === "high" ? tone.high : tone.low,
        className
      )}
      {...props}
    >
      {children ?? label}
    </Badge>
  );
}
