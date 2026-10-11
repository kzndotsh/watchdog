import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Chip } from "@/shared/ui/chip";
import { EntityKindIcon } from "@/shared/ui/vocab/entity-kind-icon";
import {
  isEntityKind,
  kindBadgeLabel,
  kindBadgeTone,
  type KindValue,
} from "@/shared/ui/vocab/kind.lib";

type KindBadgeProps = Omit<ComponentProps<typeof Chip>, "label" | "tone"> & {
  kind: KindValue;
};

export function KindBadge({
  kind,
  contrast = "low",
  className,
  children,
  ...props
}: KindBadgeProps) {
  const label = kindBadgeLabel(kind);
  let content: ReactNode = children ?? label;
  if (isEntityKind(kind)) {
    content = (
      <>
        <EntityKindIcon kind={kind} size="sm" toned={false} />
        {children ?? label}
      </>
    );
  }

  return (
    <Chip
      label={label}
      tone={kindBadgeTone(kind)}
      contrast={contrast}
      className={cn(isEntityKind(kind) && "gap-1.25", className)}
      size="sm"
      {...props}
    >
      {content}
    </Chip>
  );
}
