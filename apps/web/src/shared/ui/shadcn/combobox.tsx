import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import { ComboboxInput as BaseComboboxInput } from "@watchdog/ui/components/combobox";

export * from "@watchdog/ui/components/combobox";

/** Upstream ComboboxInput + `tone="warning"` (needs attention, e.g. third-party egress). */
export function ComboboxInput({
  tone = "default",
  className,
  ...props
}: ComponentProps<typeof BaseComboboxInput> & {
  tone?: "default" | "warning";
}) {
  return (
    <BaseComboboxInput
      className={cn(
        tone === "warning" &&
          "border-warning/40 [&_[data-slot=input-group-control]]:text-warning",
        className
      )}
      {...props}
    />
  );
}
