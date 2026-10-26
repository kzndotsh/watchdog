import { z } from "zod";

import { QUESTION_STATUS_LABELS } from "./display-labels";
import { caseScopeInputSchema } from "./graph-scope";
import { ARRAY_MAX } from "./limits";
import { defineList } from "./lists/define-list";
import { choices, ref } from "./lists/filter-kinds";
import { trimmedUuidSchema } from "./primitives";
import { QUESTION_STATUSES } from "./vocab";

/**
 * The Case's Question list (ADR-0007): one per Case. An Entity's Questions are this list with
 * `entityId` fixed (the Dossier Questions tab), open and resolved together unless `status` narrows
 * them. Oldest first by default, so a Question keeps its place.
 */
export const questionList = defineList({
  name: "questions",
  noun: { one: "question", many: "questions" },
  scope: caseScopeInputSchema,
  filters: {
    status: choices("Status", QUESTION_STATUSES, QUESTION_STATUS_LABELS),
    entityId: ref("Entity", "entity"),
  },
  sorts: {
    added: { label: "Added", type: "time", dirs: ["asc", "desc"] },
  },
  defaultSort: "added.asc",
  search: {
    fields: ["text", "resolvedNote"],
    hint: "text or resolution note",
  },
});

/**
 * `questions.getMany`: the Case's Questions with these ids (a row's version for an update, retracted or
 * not), at most `ARRAY_MAX`. Ids outside the Case are left out.
 */
export const getQuestionsInputSchema = caseScopeInputSchema.extend({
  ids: z.array(trimmedUuidSchema).min(1).max(ARRAY_MAX),
});
