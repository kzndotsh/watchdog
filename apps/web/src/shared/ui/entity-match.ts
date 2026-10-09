import {
  ENTITY_KIND_LABELS,
  entityDisplayLabel,
  slugifyName,
} from "@watchdog/schemas/shared";
import type { EntityKind } from "@watchdog/schemas/shared";

/** Combobox / picker filter — match display label, raw name, slug, or kind label. */
export function entityMatchesQuery(
  entity: { name: string; slug?: string; kind?: EntityKind },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const label = entityDisplayLabel({
    name: entity.name,
    slug: entity.slug ?? "",
  }).toLowerCase();
  const slug = (entity.slug ?? "").toLowerCase();
  const slugNeedle = slugifyName(query);
  const name = entity.name.trim().toLowerCase();
  const kind = entity.kind?.toLowerCase() ?? "";
  const kindLabel =
    entity.kind === undefined
      ? ""
      : (ENTITY_KIND_LABELS[entity.kind]?.toLowerCase() ?? "");
  return (
    label.includes(q) ||
    slug.includes(q) ||
    (slugNeedle !== "" && slug === slugNeedle) ||
    name.includes(q) ||
    (kind !== "" && kind.includes(q)) ||
    (kindLabel !== "" && kindLabel.includes(q))
  );
}
