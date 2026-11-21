import type { ComponentProps } from "react";

import { ComboboxInput as BaseComboboxInput } from "#ui/components/combobox";
import { cn } from "@/lib/utils";

export * from "#ui/components/combobox";

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
