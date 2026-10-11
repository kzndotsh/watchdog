import { cn } from "@/lib/utils";
import { WithTooltip } from "@/shared/ui/timestamp";
import { EntityKindIcon } from "@/shared/ui/vocab/entity-kind-icon";
import type { EntityKindIconSize } from "@/shared/ui/vocab/kind.lib";
import { ENTITY_KIND_LABELS } from "@watchdog/schemas/shared";
import type { EntityKind } from "@watchdog/schemas/shared";

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
