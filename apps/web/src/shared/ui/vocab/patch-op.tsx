import type { ComponentProps } from "react";

import { Chip } from "@/shared/ui/chip";
import { PATCH_OP_TONES, patchOpLabel } from "@/shared/ui/vocab/patch-op.lib";
import type { PatchOp } from "@watchdog/schemas/graph";

type Op = PatchOp["op"];

type PatchOpBadgeProps = Omit<ComponentProps<typeof Chip>, "label" | "tone"> & {
  op: Op;
};

export function PatchOpBadge({
  op,
  contrast = "low",
  className,
  children,
  ...props
}: PatchOpBadgeProps) {
  return (
    <Chip
      label={patchOpLabel(op)}
      tone={PATCH_OP_TONES[op]}
      contrast={contrast}
      className={className}
      size="sm"
      {...props}
    >
      {children}
    </Chip>
  );
}
