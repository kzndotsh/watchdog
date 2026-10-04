import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Chip } from "@/shared/ui/chip";
import { WithTooltip } from "@/shared/ui/timestamp";
import {
  CLAIM_CLASS_TONES,
  ENTITY_KIND_ICON_CLASS,
  ENTITY_KIND_ICON_SIZE,
  ENTITY_KIND_ICONS,
  type EntityKindIconSize,
  isEntityKind,
  kindBadgeLabel,
  kindBadgeTone,
  type KindValue,
} from "@/shared/ui/vocab/kind.lib";
import { CLAIM_CLASS_LABELS, ENTITY_KIND_LABELS } from "@watchdog/schemas";
import type { ClaimClass, EntityKind } from "@watchdog/schemas";

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

/** Icon + type tooltip — use before entity names (tables, dossier trail). */
export function EntityKindGlyph({
  kind,
  size = "sm",
  className,
}: {
  kind: EntityKind;
  size?: EntityKindIconSize;
  className?: string;
}) {
  const label = ENTITY_KIND_LABELS[kind];
  return (
    <WithTooltip
      content={label}
      wrapSpan
      className={cn("inline-flex shrink-0", className)}
    >
      <span role="img" aria-label={label} className="inline-flex">
        <EntityKindIcon kind={kind} size={size} />
      </span>
    </WithTooltip>
  );
}

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
