import { eq, inArray } from "drizzle-orm";

import { identifierList } from "@watchdog/schemas/graph";

import { entities } from "../schema/entities";
import { identifiers } from "../schema/identifiers";
import { defineListRepo } from "./_list-query";
import { identifierColumns } from "./identifiers.repo";

/**
 * The Case's Identifier list (`identifierList`, ADR-0007): one per Case. An Entity's Identifiers
 * are this list with `entityId` fixed (the Dossier tab), served by an index led by the Entity.
 */
export const identifierListRepo = defineListRepo(identifierList, {
  table: identifiers,
  base: (exec, listKey) =>
    exec
      .select({
        ...identifierColumns,
        entityName: entities.name,
        entitySlug: entities.slug,
        entityKind: entities.kind,
        listKey,
      })
      .from(identifiers)
      .innerJoin(entities, eq(identifiers.entityId, entities.id))
      .$dynamic(),
  id: identifiers.id,
  scopeColumn: identifiers.caseId,
  scope: ({ caseId }) => eq(identifiers.caseId, caseId),
  filters: {
    type: (types) =>
      types.length > 0 ? inArray(identifiers.type, [...types]) : undefined,
    status: (statuses) =>
      statuses.length > 0
        ? inArray(identifiers.status, [...statuses])
        : undefined,
    confidence: (tiers) =>
      tiers.length > 0
        ? inArray(identifiers.confidence, [...tiers])
        : undefined,
    entityId: (id) => (id === null ? undefined : eq(identifiers.entityId, id)),
  },
  // `identifiers_entity_value_idx (entity_id, value, id)`
  selective: { entityId: identifiers.entityId },
  sorts: { value: identifiers.value, added: identifiers.createdAt },
  searchLabels: {
    type: identifiers.type,
    status: identifiers.status,
    confidence: identifiers.confidence,
  },
  search: {
    value: identifiers.value,
    platform: identifiers.platform,
    notes: identifiers.notes,
  },
});

/** A row of the Identifier list: the Identifier, its Entity's name, slug and kind, and its cursor value. */
export type IdentifierListPageRow = Awaited<
  ReturnType<typeof identifierListRepo.page>
>[number];
