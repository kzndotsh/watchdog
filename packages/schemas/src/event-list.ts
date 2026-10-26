import { z } from "zod";

import { caseScopeInputSchema } from "./graph-scope";
import { ARRAY_MAX } from "./limits";
import { defineList } from "./lists/define-list";
import { ref } from "./lists/filter-kinds";
import { trimmedUuidSchema } from "./primitives";

/**
 * The Case's Event list (ADR-0007): one per Case. An Entity's timeline is this list with
 * `entityId` fixed (the Dossier Events tab). `when` is free text ("2024-03", "spring 2019"), so
 * the timeline sorts it as text, as the Dossier always has.
 */
export const eventList = defineList({
  name: "events",
  noun: { one: "event", many: "events" },
  scope: caseScopeInputSchema,
  filters: {
    entityId: ref("Entity", "entity"),
  },
  sorts: {
    when: { label: "When", type: "text", dirs: ["asc", "desc"] },
    added: { label: "Added", type: "time", dirs: ["desc", "asc"] },
  },
  defaultSort: "when.asc",
  search: { fields: ["what", "where", "when"], hint: "what, where or when" },
});

/**
 * `events.getMany`: the Case's Events with these ids (a row's version for an update, retracted or
 * not), at most `ARRAY_MAX`. Ids outside the Case are left out.
 */
export const getEventsInputSchema = caseScopeInputSchema.extend({
  ids: z.array(trimmedUuidSchema).min(1).max(ARRAY_MAX),
});
