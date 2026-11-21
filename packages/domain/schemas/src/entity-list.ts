import { z } from "zod";

import { ENTITY_KIND_LABELS } from "./display-labels";
import { caseScopeInputSchema } from "./graph-scope";
import { ARRAY_MAX, NAME_MAX } from "./limits";
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
    created: { label: "Created", type: "time", dirs: ["desc", "asc"] },
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

/** Most names one `entities.matchNames` call takes: a paste is matched in batches of this size. */
export const ENTITY_NAME_LOOKUP_MAX = 50;

/**
 * `entities.matchNames`: the Case's Entities that pasted names may mean (the Identifiers bulk
 * add), at most `ENTITY_NAME_LOOKUP_MAX` names. An Entity matches a name when its name equals it
 * ignoring case, or its slug equals the name slugified; the answer may hold several Entities for
 * one name (the caller decides what an ambiguous name means) and none for an unknown one.
 */
export const matchEntityNamesInputSchema = caseScopeInputSchema.extend({
  names: z
    .array(z.string().trim().min(1).max(NAME_MAX))
    .min(1)
    .max(ENTITY_NAME_LOOKUP_MAX),
});
