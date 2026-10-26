import { QUESTION_STATUS_LABELS } from "./display-labels";
import { caseScopeInputSchema } from "./graph-scope";
import { defineList } from "./lists/define-list";
import { choices, ref } from "./lists/filter-kinds";
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
