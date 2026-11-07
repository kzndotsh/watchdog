import { defineGraphChildMutation } from "@/domains/entities/hooks/use-graph-child-mutation";
import {
  createQuestionFn,
  deleteQuestionFn,
  reopenQuestionFn,
  resolveQuestionFn,
  updateQuestionFn,
} from "@/domains/entities/questions/questions.functions";
import type { EntityScope } from "@/domains/entities/types";
import {
  createQuestionInputSchema,
  questionScopeInputSchema,
  resolveQuestionInputSchema,
  updateQuestionInputSchema,
} from "@watchdog/schemas/graph";

export type CreateQuestionVariables = EntityScope & { text: string };

/** Add an Open Question to an Entity. */
export const useCreateQuestion = defineGraphChildMutation({
  fn: createQuestionFn,
  parse: ({ caseId, entityId, text }: CreateQuestionVariables) =>
    createQuestionInputSchema.parse({ caseId, entityId, text }),
  success: "Question added",
  verb: "add",
  noun: "question",
});

export type UpdateQuestionVariables = EntityScope & {
  questionId: string;
  /** The Question's `version` when the editor opened; the save fails as stale if it moved on. */
  expectedVersion: number;
  text: string;
  resolvedNote?: string | null;
};

/** Edit an Open Question's text (or resolution note). */
export const useUpdateQuestion = defineGraphChildMutation({
  fn: updateQuestionFn,
  parse: ({
    caseId,
    questionId,
    expectedVersion,
    text,
    resolvedNote,
  }: UpdateQuestionVariables) =>
    updateQuestionInputSchema.parse({
      caseId,
      questionId,
      expectedVersion,
      text,
      ...(resolvedNote === undefined ? {} : { resolvedNote }),
    }),
  success: "Question updated",
  verb: "update",
  noun: "question",
});

export type ResolveQuestionVariables = EntityScope & {
  questionId: string;
  resolvedNote?: string;
};

/** Resolve an Open Question. */
export const useResolveQuestion = defineGraphChildMutation({
  fn: resolveQuestionFn,
  parse: ({ caseId, questionId, resolvedNote }: ResolveQuestionVariables) =>
    resolveQuestionInputSchema.parse({ caseId, questionId, resolvedNote }),
  success: "Question resolved",
  verb: "resolve",
  noun: "question",
});

export type QuestionVariables = EntityScope & { questionId: string };

/** Reopen a resolved Question. */
export const useReopenQuestion = defineGraphChildMutation({
  fn: reopenQuestionFn,
  parse: ({ caseId, questionId }: QuestionVariables) =>
    questionScopeInputSchema.parse({ caseId, questionId }),
  success: "Question reopened",
  verb: "reopen",
  noun: "question",
});

/** Delete a Question. */
export const useDeleteQuestion = defineGraphChildMutation({
  fn: deleteQuestionFn,
  parse: ({ caseId, questionId }: QuestionVariables) =>
    questionScopeInputSchema.parse({ caseId, questionId }),
  success: "Question deleted",
  verb: "delete",
  noun: "question",
});
