import { eq, inArray } from "drizzle-orm";

import { questionList } from "@watchdog/schemas/graph";

import { questions } from "../schema/questions";
import { defineListRepo } from "./_list-query";
import { questionColumns } from "./questions.repo";

/**
 * The Case's Question list (`questionList`, ADR-0007): one per Case. An Entity's Questions are
 * this list with `entityId` fixed (the Dossier tab), served by `questions_entity_created_idx`.
 */
export const questionListRepo = defineListRepo(questionList, {
  table: questions,
  base: (exec, listKey) =>
    exec
      .select({ ...questionColumns, listKey })
      .from(questions)
      .$dynamic(),
  id: questions.id,
  scopeColumn: questions.caseId,
  scope: ({ caseId }) => eq(questions.caseId, caseId),
  filters: {
    status: (statuses) =>
      statuses.length > 0
        ? inArray(questions.status, [...statuses])
        : undefined,
    entityId: (id) => (id === null ? undefined : eq(questions.entityId, id)),
  },
  // `questions_entity_created_idx (entity_id, created_at, id)`
  selective: { entityId: questions.entityId },
  sorts: { created: questions.createdAt },
  searchLabels: { status: questions.status },
  search: { text: questions.text, resolvedNote: questions.resolvedNote },
});

/** A row of the Question list: the Question and its cursor value. */
export type QuestionListRow = Awaited<
  ReturnType<typeof questionListRepo.page>
>[number];
