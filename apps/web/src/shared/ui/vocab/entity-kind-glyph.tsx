import { cn } from "@/lib/utils";
import { EntityKindIcon } from "@/shared/ui/vocab/entity-kind-icon";
import type { EntityKindIconSize } from "@/shared/ui/vocab/kind.lib";
import { WithTooltip } from "@/shared/ui/with-tooltip";
import { ENTITY_KIND_LABELS } from "@watchdog/schemas/shared";
import type { EntityKind } from "@watchdog/schemas/shared";

type EntityKindGlyphProps = {
  kind: EntityKind;
  size?: EntityKindIconSize;
  className?: string;
};

/** Icon + type tooltip — use before entity names (tables, dossier trail). */
export function EntityKindGlyph({
  kind,
  size = "sm",
  className,
}: EntityKindGlyphProps) {
  const label = ENTITY_KIND_LABELS[kind];
  return (
    <WithTooltip
      content={label}
      shouldWrapSpan
      className={cn("inline-flex shrink-0", className)}
    >
      <span role="img" aria-label={label} className="inline-flex">
        <EntityKindIcon kind={kind} size={size} />
      </span>
    </WithTooltip>
  );
}
