import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { PopoverContent as BasePopoverContent } from "@watchdog/ui/components/popover";

export * from "@watchdog/ui/components/popover";

/** Upstream PopoverContent + `flush` (children own their padding and spacing). */
export function PopoverContent({
  flush = false,
  className,
  ...props
}: ComponentProps<typeof BasePopoverContent> & { flush?: boolean }) {
  return (
    <BasePopoverContent
      className={cn(flush && "gap-0 p-0", className)}
      {...props}
    />
  );
}
