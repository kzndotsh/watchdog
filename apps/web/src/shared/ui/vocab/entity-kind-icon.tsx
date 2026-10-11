import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";
import {
  ENTITY_KIND_ICON_CLASS,
  ENTITY_KIND_ICON_SIZE,
  ENTITY_KIND_ICONS,
  type EntityKindIconSize,
} from "@/shared/ui/vocab/kind.lib";
import type { EntityKind } from "@watchdog/schemas/shared";

/** Kind glyph for person / org / infra. */
export function EntityKindIcon({
  kind,
  size = "md",
  toned = true,
  className,
  ...props
}: {
  kind: EntityKind;
  size?: EntityKindIconSize;
  /** Inherit currentColor when nested in KindBadge. */
  toned?: boolean;
  className?: string;
} & Omit<ComponentProps<"svg">, "children">) {
  const Icon = ENTITY_KIND_ICONS[kind];
  return (
    <Icon
      aria-hidden
      strokeWidth={2}
      className={cn(
        "shrink-0",
        ENTITY_KIND_ICON_SIZE[size],
        toned && ENTITY_KIND_ICON_CLASS[kind],
        className
      )}
      {...props}
    />
  );
}
