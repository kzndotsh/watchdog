import { z } from "zod";

import {
  CONFIDENCE_TIER_LABELS,
  IDENTIFIER_STATUS_LABELS,
  IDENTIFIER_TYPE_LABELS,
} from "./display-labels";
import { caseScopeInputSchema } from "./graph-scope";
import { ARRAY_MAX } from "./limits";
import { defineList } from "./lists/define-list";
import { choices, ref } from "./lists/filter-kinds";
import { trimmedUuidSchema } from "./primitives";
import {
  CONFIDENCE_TIERS,
  IDENTIFIER_STATUSES,
  IDENTIFIER_TYPES,
} from "./vocab";

/**
 * The Case's Identifier list (ADR-0007): one per Case. An Entity's Identifiers are this list
 * with `entityId` fixed (the Dossier tab). There is no sort by the owning Entity's name: it is a
 * joined column, which a list cannot sort by.
 */
export const identifierList = defineList({
  name: "identifiers",
  noun: { one: "identifier", many: "identifiers" },
  scope: caseScopeInputSchema,
  filters: {
    type: choices("Type", IDENTIFIER_TYPES, IDENTIFIER_TYPE_LABELS),
    status: choices("Status", IDENTIFIER_STATUSES, IDENTIFIER_STATUS_LABELS),
    confidence: choices("Confidence", CONFIDENCE_TIERS, CONFIDENCE_TIER_LABELS),
    entityId: ref("Entity", "entity"),
  },
  sorts: {
    value: { label: "Value", type: "text", dirs: ["asc", "desc"] },
    created: { label: "Created", type: "time", dirs: ["desc", "asc"] },
    updated: { label: "Updated", type: "time", dirs: ["desc", "asc"] },
  },
  defaultSort: "value.asc",
  search: {
    fields: ["value", "platform", "notes"],
    hint: "value, platform or notes",
  },
});

/**
 * `identifiers.getMany`: the Case's Identifiers with these ids (rows a screen or the CLI names
 * but has not loaded), at most `ARRAY_MAX`. Ids outside the Case are left out of the answer.
 */
export const getIdentifiersInputSchema = caseScopeInputSchema.extend({
  ids: z.array(trimmedUuidSchema).min(1).max(ARRAY_MAX),
});
