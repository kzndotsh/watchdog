import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { Textarea as BaseTextarea } from "@watchdog/ui/components/textarea";

export * from "@watchdog/ui/components/textarea";

/** Upstream Textarea + `mono`. */
export function Textarea({
  mono = false,
  className,
  ...props
}: ComponentProps<typeof BaseTextarea> & { mono?: boolean }) {
  return (
    <BaseTextarea className={cn(mono && "font-mono", className)} {...props} />
  );
}
