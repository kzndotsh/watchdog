import { CLAIM_CLASS_LABELS, CONFIDENCE_TIER_LABELS } from "./display-labels";
import { caseScopeInputSchema } from "./graph-scope";
import { defineList } from "./lists/define-list";
import { choices, flag, ref } from "./lists/filter-kinds";
import { CLAIM_CLASSES, CONFIDENCE_TIERS } from "./vocab";

/**
 * The Case's Claim list (ADR-0007): one per Case. An Entity's Claims are this list with
 * `entityId` fixed (the Dossier Claims tab). Retracted Claims (retracted, contested or disproved)
 * are the `retracted` view, never mixed with the live ones, as hidden Evidence is: absent means
 * the live Claims. Oldest first by default, so a Claim keeps its number in the Dossier.
 */
export const claimList = defineList({
  name: "claims",
  noun: { one: "claim", many: "claims" },
  scope: caseScopeInputSchema,
  filters: {
    retracted: flag("Retracted"),
    class: choices("Class", CLAIM_CLASSES, CLAIM_CLASS_LABELS),
    confidence: choices("Confidence", CONFIDENCE_TIERS, CONFIDENCE_TIER_LABELS),
    entityId: ref("Entity", "entity"),
  },
  sorts: {
    added: { label: "Added", type: "time", dirs: ["asc", "desc"] },
  },
  defaultSort: "added.asc",
  search: { fields: ["text"], hint: "text" },
});
