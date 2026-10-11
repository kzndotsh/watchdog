import type { ComponentProps } from "react";

import { Chip } from "@/shared/ui/chip";
import {
  STATUS_LABELS,
  STATUS_TONES,
  type DisplayStatus,
} from "@/shared/ui/vocab/status.lib";

type StatusBadgeProps = Omit<ComponentProps<typeof Chip>, "label" | "tone"> & {
  status: DisplayStatus;
};

export function StatusBadge({
  status,
  contrast = "low",
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <Chip
      label={STATUS_LABELS[status]}
      tone={STATUS_TONES[status]}
      contrast={contrast}
      className={className}
      size="sm"
      {...props}
    >
      {children}
    </Chip>
  );
}
