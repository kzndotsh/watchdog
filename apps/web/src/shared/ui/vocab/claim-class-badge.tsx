import type { ComponentProps } from "react";

import { Chip } from "@/shared/ui/chip";
import { CLAIM_CLASS_TONES } from "@/shared/ui/vocab/kind.lib";
import { CLAIM_CLASS_LABELS } from "@watchdog/schemas/shared";
import type { ClaimClass } from "@watchdog/schemas/shared";

type ClaimClassBadgeProps = Omit<
  ComponentProps<typeof Chip>,
  "label" | "tone"
> & {
  claimClass: ClaimClass;
};

export function ClaimClassBadge({
  claimClass,
  contrast = "low",
  className,
  children,
  ...props
}: ClaimClassBadgeProps) {
  return (
    <Chip
      label={CLAIM_CLASS_LABELS[claimClass]}
      tone={CLAIM_CLASS_TONES[claimClass]}
      contrast={contrast}
      className={className}
      size="sm"
      {...props}
    >
      {children}
    </Chip>
  );
}
