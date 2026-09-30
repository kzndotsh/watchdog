import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import {
  Field as BaseField,
  FieldGroup as BaseFieldGroup,
} from "@watchdog/ui/components/field";

export * from "@watchdog/ui/components/field";

/** Upstream FieldGroup + `density` (cozy = forms, compact = toolbars and popovers). */
export function FieldGroup({
  density = "default",
  className,
  ...props
}: ComponentProps<typeof BaseFieldGroup> & {
  density?: "default" | "cozy" | "compact";
}) {
  return (
    <BaseFieldGroup
      className={cn(
        density === "cozy" && "gap-3",
        density === "compact" && "gap-2",
        className
      )}
      {...props}
    />
  );
}

/** Upstream Field + `density="compact"` (tight label / control stacks). */
export function Field({
  density = "default",
  className,
  ...props
}: ComponentProps<typeof BaseField> & { density?: "default" | "compact" }) {
  return (
    <BaseField
      className={cn(density === "compact" && "gap-1.5", className)}
      {...props}
    />
  );
}
