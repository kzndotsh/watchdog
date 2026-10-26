import {
  CONFIDENCE_TIER_LABELS,
  IDENTIFIER_STATUS_LABELS,
  IDENTIFIER_TYPE_LABELS,
} from "./display-labels";
import { caseScopeInputSchema } from "./graph-scope";
import { defineList } from "./lists/define-list";
import { choices, ref } from "./lists/filter-kinds";
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
    added: { label: "Added", type: "time", dirs: ["desc", "asc"] },
  },
  defaultSort: "value.asc",
  search: {
    fields: ["value", "platform", "notes"],
    hint: "value, platform or notes",
  },
});
