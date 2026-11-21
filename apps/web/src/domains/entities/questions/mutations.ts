import { defineGraphChildMutation } from "@/domains/entities/hooks/use-graph-child-mutation";
import type { EntityScope } from "@/domains/entities/types";
import { orpc } from "@/lib/orpc-client";

export type CreateQuestionVariables = EntityScope & { text: string };

/** Add an Open Question to an Entity. */
export const useCreateQuestion = defineGraphChildMutation({
  call: orpc.questions.create.call,
  parse: ({ caseId, entityId, text }: CreateQuestionVariables) => ({
    caseId,
    entityId,
    text,
  }),
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
  call: orpc.questions.update.call,
  parse: ({
    caseId,
    questionId,
    expectedVersion,
    text,
    resolvedNote,
  }: UpdateQuestionVariables) => ({
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
  call: orpc.questions.resolve.call,
  parse: ({ caseId, questionId, resolvedNote }: ResolveQuestionVariables) => ({
    caseId,
    questionId,
    resolvedNote,
  }),
  success: "Question resolved",
  verb: "resolve",
  noun: "question",
});

export type QuestionVariables = EntityScope & { questionId: string };

/** Reopen a resolved Question. */
export const useReopenQuestion = defineGraphChildMutation({
  call: orpc.questions.reopen.call,
  parse: ({ caseId, questionId }: QuestionVariables) => ({
    caseId,
    questionId,
  }),
  success: "Question reopened",
  verb: "reopen",
  noun: "question",
});

/** Delete a Question. */
export const useDeleteQuestion = defineGraphChildMutation({
  call: orpc.questions.delete.call,
  parse: ({ caseId, questionId }: QuestionVariables) => ({
    caseId,
    questionId,
  }),
  success: "Question deleted",
  verb: "delete",
  noun: "question",
});
