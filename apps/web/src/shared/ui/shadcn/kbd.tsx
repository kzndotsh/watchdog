import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Kbd as BaseKbd } from "@watchdog/ui/components/kbd";

export * from "@watchdog/ui/components/kbd";

/** Upstream Kbd + `tone="inherit"` (inside a colored control, borrow its ink). */
export function Kbd({
  tone = "default",
  className,
  ...props
}: ComponentProps<typeof BaseKbd> & { tone?: "default" | "inherit" }) {
  return (
    <BaseKbd
      className={cn(tone === "inherit" && "bg-current/15 text-current", className)}
      {...props}
    />
  );
}
