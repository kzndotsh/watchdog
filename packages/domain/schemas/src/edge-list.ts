import { z } from "zod";

import {
  CONFIDENCE_TIER_LABELS,
  EDGE_PREDICATE_LABELS,
} from "./display-labels";
import { caseScopeInputSchema } from "./graph-scope";
import { ARRAY_MAX } from "./limits";
import { defineList } from "./lists/define-list";
import { choices, ref } from "./lists/filter-kinds";
import { trimmedUuidSchema } from "./primitives";
import { CONFIDENCE_TIERS, EDGE_PREDICATES } from "./vocab";

/**
 * The Case's Connection list (ADR-0007): one per Case, over the `edges` table. An Entity's
 * Connections are this list with `entityId` fixed (the Dossier Connections tab and the Entities
 * table's Connections popover): `entityId` matches a Connection at either end, so a row carries
 * both ends and the screen tells outbound from inbound. A peer's name is a joined column: it is
 * neither searched nor sorted (search the notes and the predicate's label).
 */
export const edgeList = defineList({
  name: "edges",
  noun: { one: "connection", many: "connections" },
  scope: caseScopeInputSchema,
  filters: {
    predicate: choices("Predicate", EDGE_PREDICATES, EDGE_PREDICATE_LABELS),
    confidence: choices("Confidence", CONFIDENCE_TIERS, CONFIDENCE_TIER_LABELS),
    entityId: ref("Entity", "entity"),
  },
  sorts: {
    predicate: { label: "Predicate", type: "text", dirs: ["asc", "desc"] },
    updated: { label: "Updated", type: "time", dirs: ["desc", "asc"] },
  },
  defaultSort: "predicate.asc",
  search: { fields: ["notes"], hint: "notes or predicate" },
});

/**
 * `edges.getMany`: the Case's Connections with these ids (a Connection the ego graph draws but
 * the list has not loaded), at most `ARRAY_MAX`. Ids outside the Case are left out.
 */
export const getEdgesInputSchema = caseScopeInputSchema.extend({
  ids: z.array(trimmedUuidSchema).min(1).max(ARRAY_MAX),
});
