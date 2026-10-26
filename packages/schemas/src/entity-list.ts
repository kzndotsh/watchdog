import { z } from "zod";

import { ENTITY_KIND_LABELS } from "./display-labels";
import { caseScopeInputSchema } from "./graph-scope";
import { ARRAY_MAX } from "./limits";
import { defineList } from "./lists/define-list";
import { choices } from "./lists/filter-kinds";
import { trimmedUuidSchema } from "./primitives";
import { ENTITY_KINDS } from "./vocab";

/**
 * The Case's Entity list (ADR-0007), minimal for the server-searched Entity pickers (#559): the
 * Entities screen's ticket extends it (more filters, sorts) rather than adding a second one.
 * `updated.desc` is the pickers' "recent" view when the box is empty. Entities have no alias
 * column, so search covers the name, the summary and the notes.
 */
export const entityList = defineList({
  name: "entities",
  noun: { one: "entity", many: "entities" },
  scope: caseScopeInputSchema,
  filters: {
    kind: choices("Kind", ENTITY_KINDS, ENTITY_KIND_LABELS),
  },
  sorts: {
    name: { label: "Name", type: "text", dirs: ["asc", "desc"] },
    updated: { label: "Updated", type: "time", dirs: ["desc", "asc"] },
  },
  defaultSort: "name.asc",
  search: {
    fields: ["name", "summary", "notes"],
    hint: "name, summary or notes",
  },
});

/**
 * `entities.getMany`: the Case's Entities with these ids (a picker's selected value, a filter
 * chip's title), at most `ARRAY_MAX`. Ids outside the Case are left out of the answer.
 */
export const getEntitiesInputSchema = caseScopeInputSchema.extend({
  ids: z.array(trimmedUuidSchema).min(1).max(ARRAY_MAX),
});
