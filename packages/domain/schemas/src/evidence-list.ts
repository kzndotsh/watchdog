import { z } from "zod";

import { EVIDENCE_KIND_LABELS } from "./display-labels";
import { caseScopeInputSchema } from "./graph-scope";
import { ARRAY_MAX } from "./limits";
import { defineList } from "./lists/define-list";
import { choices, flag, ref } from "./lists/filter-kinds";
import { trimmedUuidSchema } from "./primitives";
import { EVIDENCE_KINDS } from "./vocab";

/**
 * The Case's Evidence list (ADR-0007). `hidden`, `unprocessed` and `unattached` are TRUE-ONLY
 * flags (the CLI flag names they already had). `hidden` stays a flag rather than a `view` choice
 * so that `exclusive` stays a plain list of filter pairs.
 */
export const evidenceList = defineList({
  name: "evidence",
  noun: { one: "evidence item", many: "evidence" },
  scope: caseScopeInputSchema,
  filters: {
    hidden: flag("Hidden"),
    unprocessed: flag("Unprocessed"),
    unattached: flag("Unattached"),
    kind: choices("Kind", EVIDENCE_KINDS, EVIDENCE_KIND_LABELS),
    /** The Dossier Evidence tab: this list with `entityId` fixed. */
    entityId: ref("Entity", "entity"),
  },
  exclusive: [
    ["hidden", "unprocessed"],
    ["hidden", "unattached"],
    // Attached to no Entity and to this one: always empty, so the Dossier tab never offers it.
    ["unattached", "entityId"],
  ],
  sorts: {
    captured: { label: "Captured", type: "time", dirs: ["desc", "asc"] },
    /** `label` is nullable: the db binds it as `coalesce(label, '')` with its expression index. */
    label: { label: "Label", type: "text", dirs: ["asc", "desc"] },
  },
  defaultSort: "captured.desc",
  // `text` (the body) and `sha256` stay with the command palette: a trigram index over bodies
  // is the one index this standard refuses to pay for.
  search: {
    fields: ["label", "notes", "sourceUrl"],
    hint: "label, notes or URL",
  },
});

/**
 * `evidence.getMany`: the Case's Evidence with these ids, hidden or not (linked Evidence titles,
 * a picker's selected items), at most `ARRAY_MAX`. Ids outside the Case are left out of the answer.
 */
export const getEvidenceManyInputSchema = caseScopeInputSchema.extend({
  ids: z.array(trimmedUuidSchema).min(1).max(ARRAY_MAX),
});
