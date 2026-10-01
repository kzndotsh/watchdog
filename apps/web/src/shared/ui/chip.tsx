/* oxlint-disable react/only-export-components, react-doctor/only-export-components -- size tokens + chip component */
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Badge } from "@watchdog/ui/components/badge";

export type ChipSize = "sm" | "md";

/** Shared dense chip chrome (matches IdChip height/radius; sans label). */
export const CHIP_SIZE_CLASS: Record<ChipSize, string> = {
  sm: "h-5 gap-0.5 rounded-md border border-border/60 px-1.5 py-0 text-2xs font-normal leading-none",
  md: "h-5 gap-1 rounded-md border border-border/60 px-1.5 py-0 text-2xs font-normal leading-none",
};

export interface ChipTone {
  low: string;
  high: string;
}

type ChipProps = Omit<ComponentProps<typeof Badge>, "variant"> & {
  size?: ChipSize;
  /** Semantic color classes from a vocab map; omit for the neutral outline chip. */
  tone?: ChipTone;
  contrast?: "low" | "high";
  /** Shorthand for children (vocab wrappers pass their label). */
  label?: string;
};

/**
 * The one dense outline chip: `Badge` with the shared shape. Neutral without `tone`
 * (outcome / tag pills); per-vocab wrappers (`ConfidenceBadge`, `StatusBadge`, …)
 * supply exhaustive tone maps, so do not invent tones here.
 */
export function Chip({
  size = "md",
  tone,
  contrast = "low",
  label,
  className,
  children,
  ...props
}: ChipProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        CHIP_SIZE_CLASS[size],
        tone ? tone[contrast] : "text-foreground/80 bg-transparent",
        className
      )}
      {...props}
    >
      {children ?? label}
    </Badge>
  );
}
