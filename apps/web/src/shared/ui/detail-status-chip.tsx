/* oxlint-disable react/only-export-components, react-doctor/only-export-components -- size tokens + chip component */
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Badge } from "@/shared/ui/shadcn/badge";

type ChipSize = "sm" | "md";

/** Shared dense chip chrome (matches IdChip height/radius; sans label). */
export const CHIP_SIZE_CLASS: Record<ChipSize, string> = {
  sm: "h-5 gap-0.5 rounded-md border border-border/60 px-1.5 py-0 text-label-meta leading-none",
  md: "h-5 gap-1 rounded-md border border-border/60 px-1.5 py-0 text-label-meta leading-none",
};

export const DETAIL_CHIP_CLASS = CHIP_SIZE_CLASS.md;

type DetailStatusChipProps = Omit<ComponentProps<typeof Badge>, "variant"> & {
  size?: ChipSize;
};

export function DetailStatusChip({
  className,
  size = "md",
  ...props
}: DetailStatusChipProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        CHIP_SIZE_CLASS[size],
        "text-foreground/80 bg-transparent",
        className
      )}
      {...props}
    />
  );
}
