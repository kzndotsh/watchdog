import type { PatchOp } from "./patch";
import { patchEntityOpDisplayLabel, patchOpRelatedEntityIds } from "./patch";
import { entityDisplayLabel } from "./vocab";

/** First cited entity id that has display maps, else first cited id in the patch. */
export function proposalEntityId(opts: {
  patch: PatchOp[];
  entityNames?: Record<string, string>;
  entitySlugs?: Record<string, string>;
}): string | null {
  let firstCited: string | null = null;
  for (const op of opts.patch) {
    if (op.resource === "entity") {
      firstCited ??= op.id;
      const name = opts.entityNames?.[op.id];
      const slug = opts.entitySlugs?.[op.id];
      if (name !== undefined || slug !== undefined) return op.id;
      if (patchEntityOpDisplayLabel(op) !== null) return op.id;
    }
    for (const entityId of patchOpRelatedEntityIds(op)) {
      if (op.resource === "entity" && entityId === op.id) continue;
      firstCited ??= entityId;
      const name = opts.entityNames?.[entityId];
      const slug = opts.entitySlugs?.[entityId];
      if (name !== undefined || slug !== undefined) return entityId;
    }
  }
  return firstCited;
}

/** Dossier slug for the proposal's primary entity, when known. */
export function proposalEntitySlug(opts: {
  patch: PatchOp[];
  entityNames?: Record<string, string>;
  entitySlugs?: Record<string, string>;
}): string | null {
  const entityId = proposalEntityId(opts);
  if (!entityId) return null;
  const slug = opts.entitySlugs?.[entityId];
  return slug !== undefined && slug !== "" ? slug : null;
}

/** Entity display label from patch ops that cite an entity. */
export function proposalEntityName(opts: {
  patch: PatchOp[];
  entityNames?: Record<string, string>;
  entitySlugs?: Record<string, string>;
}): string | null {
  for (const op of opts.patch) {
    const entityOpLabel = patchEntityOpDisplayLabel(op);
    if (entityOpLabel !== null) return entityOpLabel;
    for (const entityId of patchOpRelatedEntityIds(op)) {
      if (op.resource === "entity" && entityId === op.id) continue;
      const name = opts.entityNames?.[entityId];
      const slug = opts.entitySlugs?.[entityId];
      if (name === undefined && slug === undefined) continue;
      if (slug === undefined || slug === "") {
        const trimmed = name?.trim();
        if (trimmed !== undefined && trimmed !== "") return trimmed;
        continue;
      }
      const label = entityDisplayLabel({ name: name ?? "", slug });
      if (label !== "") return label;
    }
  }
  return null;
}
