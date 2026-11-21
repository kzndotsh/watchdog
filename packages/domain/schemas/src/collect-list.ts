import { z } from "zod";

import { COLLECT_KIND_LABELS, COLLECT_STATE_LABELS } from "./display-labels";
import { caseScopeInputSchema } from "./graph-scope";
import { defineList } from "./lists/define-list";
import { choices, flag, ref, tags } from "./lists/filter-kinds";
import { trimmedUuidSchema } from "./primitives";
import { COLLECT_ROW_KINDS } from "./vocab-collect-queue";

/** The states a user picks (`hidden` is its own flag). */
const COLLECT_STATE_CHOICES = [
  "queued",
  "running",
  "unprocessed",
  "landed",
  "failed",
  "cancelled",
] as const;

/** The longest Cap or playbook id the `capability` filter takes. */
const COLLECT_CAPABILITY_ID_MAX = 200;

/**
 * Collect's queue (#574, ADR-0007): the rows of the `collect_queue` projection, each an Evidence
 * row, a playbook run or a lone Job, read a page at a time. `hidden` is the Evidence the user
 * hid (no Jobs, no state, no Cap) and excludes the facets that only live rows have.
 *
 * `activity` is the default and offers `desc` only: it is a MOVING key (a run or Job row rises
 * when a Job starts or finishes, and drops when a step attaches to Evidence), built from stored
 * transition times and never `updated_at`. An Evidence row's activity is its `captured_at`.
 * `started` never moves and offers both directions. `q` matches the row's label, URL, notes, Cap
 * and playbook ids and its Jobs' summary, error and input hints (`search_text`), plus the state
 * labels; a pasted id is found by `collect.get`.
 */
export const collectList = defineList({
  name: "collect",
  noun: { one: "item", many: "items" },
  scope: caseScopeInputSchema,
  filters: {
    hidden: flag("Hidden"),
    state: choices("State", COLLECT_STATE_CHOICES, COLLECT_STATE_LABELS),
    kind: choices("Kind", COLLECT_ROW_KINDS, COLLECT_KIND_LABELS),
    unprocessed: flag("Unprocessed"),
    unattached: flag("Unattached"),
    capability: tags("Cap or playbook", {
      maxLength: COLLECT_CAPABILITY_ID_MAX,
    }),
    /** The Evidence row's Entity (run and Job rows have none). */
    entityId: ref("Entity", "entity"),
  },
  exclusive: [
    ["hidden", "state"],
    ["hidden", "unprocessed"],
    ["hidden", "unattached"],
    ["hidden", "capability"],
    ["hidden", "kind"],
    ["unattached", "entityId"],
  ],
  sorts: {
    activity: {
      label: "Latest activity",
      type: "time",
      dirs: ["desc"],
      moving: true,
    },
    started: { label: "Started", type: "time", dirs: ["desc", "asc"] },
  },
  defaultSort: "activity.desc",
  search: {
    fields: ["text"],
    hint: "label, URL, Cap, playbook or error",
  },
});

/**
 * `collect.get`: find the row an id belongs to. `id` is a row id, a member Job's id, or a run
 * whose steps all attached to Evidence. `hidden` is the list's mode: a hidden Evidence id is
 * found only with it set, and a live row only without.
 */
export const locateCollectInputSchema = caseScopeInputSchema.extend({
  id: trimmedUuidSchema,
  hidden: z.literal(true).optional(),
});
export type LocateCollectInput = z.output<typeof locateCollectInputSchema>;
