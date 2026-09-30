import type { ComponentProps } from "react";

import { Chip } from "@/shared/ui/chip";
import {
  CONFIDENCE_LABELS,
  CONFIDENCE_TONES,
} from "@/shared/ui/vocab/confidence.lib";
import type { ConfidenceTier } from "@watchdog/schemas";

type ConfidenceBadgeProps = Omit<
  ComponentProps<typeof Chip>,
  "label" | "tone"
> & {
  confidence: ConfidenceTier;
};

export function ConfidenceBadge({
  confidence,
  contrast = "low",
  className,
  children,
  ...props
}: ConfidenceBadgeProps) {
  return (
    <Chip
      label={CONFIDENCE_LABELS[confidence]}
      tone={CONFIDENCE_TONES[confidence]}
      contrast={contrast}
      className={className}
      size="sm"
      {...props}
    >
      {children}
    </Chip>
  );
}
