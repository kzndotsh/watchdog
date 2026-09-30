import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Input as BaseInput } from "@watchdog/ui/components/input";

export * from "@watchdog/ui/components/input";

/** Upstream Input + `mono` (ids, hashes and paths render monospace). */
export function Input({
  mono = false,
  className,
  ...props
}: ComponentProps<typeof BaseInput> & { mono?: boolean }) {
  return (
    <BaseInput className={cn(mono && "font-mono", className)} {...props} />
  );
}
