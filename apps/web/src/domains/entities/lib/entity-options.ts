import type { EntityRecord } from "@/domains/entities/types";
import type { EntityOption } from "@/shared/ui/entity-combobox";

/** Map case entities to combobox options — always pass slug for display fallbacks. */
export function entityOptionsFromRecords(
  entities: readonly EntityRecord[]
): EntityOption[] {
  return entities.map((entity) => ({
    id: entity.id,
    name: entity.name,
    kind: entity.kind,
    slug: entity.slug,
  }));
}
