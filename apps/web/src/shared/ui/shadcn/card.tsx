import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Card as BaseCard } from "@watchdog/ui/components/card";

export * from "@watchdog/ui/components/card";

/** Upstream Card + `size="flush"` (rows own their padding: no card spacing). */
export function Card({
  size = "default",
  className,
  ...props
}: Omit<ComponentProps<typeof BaseCard>, "size"> & {
  size?: "default" | "sm" | "flush";
}) {
  return (
    <BaseCard
      size={size === "flush" ? "default" : size}
      className={cn(size === "flush" && "[--card-spacing:0px]", className)}
      {...props}
    />
  );
}
