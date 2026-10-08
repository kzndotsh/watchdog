import { and, asc, eq, inArray } from "drizzle-orm";

import type { CaseId } from "@watchdog/schemas/shared";
import { normalizeUuidList } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { entities } from "../schema/entities";
import { questions } from "../schema/questions";
import { entityRowInCase } from "./_entity-in-case";
import { trimCaseId, trimResourceId, trimScopedCaseIds } from "./_scoped-ids";

export const questionColumns = {
  id: questions.id,
  entityId: questions.entityId,
  text: questions.text,
  status: questions.status,
  resolvedNote: questions.resolvedNote,
} as const;

export type QuestionRow = {
  [K in keyof typeof questionColumns]: (typeof questions.$inferSelect)[K &
    keyof typeof questions.$inferSelect];
};

export type NewQuestion = Pick<
  typeof questions.$inferInsert,
  "entityId" | "text" | "status"
> &
  Partial<Pick<typeof questions.$inferInsert, "id">>;

export type QuestionPatch = Partial<
  Pick<typeof questions.$inferInsert, "text" | "status" | "resolvedNote">
>;

export interface ResolveQuestionValues {
  resolvedNote: string | null;
}

export interface QuestionTextKey {
  entityId: string;
  text: string;
}

export const questionsRepo = {
  async listForEntity(exec: DbExec, entityId: string): Promise<QuestionRow[]> {
    const scopedEntityId = trimResourceId(entityId);
    if (scopedEntityId === undefined) return [];
    return exec
      .select(questionColumns)
      .from(questions)
      .where(eq(questions.entityId, scopedEntityId))
      .orderBy(asc(questions.createdAt));
  },

  async getInCase(
    exec: DbExec,
    caseId: CaseId,
    questionId: string
  ): Promise<QuestionRow | null> {
    const scoped = trimScopedCaseIds(caseId, questionId);
    if (!scoped) return null;
    const [row] = await exec
      .select(questionColumns)
      .from(questions)
      .innerJoin(entities, eq(questions.entityId, entities.id))
      .where(
        and(
          eq(questions.id, scoped.resourceId),
          eq(entities.caseId, scoped.caseId)
        )
      )
      .limit(1);
    return row ?? null;
  },

  /** Text keys for FP suppress — scoped to case + entity ids. */
  async listTextKeysInCase(
    exec: DbExec,
    caseId: CaseId,
    entityIds: string[]
  ): Promise<QuestionTextKey[]> {
    const scopedCaseId = trimCaseId(caseId);
    const normalized = normalizeUuidList(entityIds);
    if (scopedCaseId === undefined || normalized.length === 0) return [];
    return exec
      .select({ entityId: questions.entityId, text: questions.text })
      .from(questions)
      .innerJoin(entities, eq(questions.entityId, entities.id))
      .where(
        and(
          eq(entities.caseId, scopedCaseId),
          inArray(questions.entityId, normalized)
        )
      );
  },

  async create(exec: DbExec, values: NewQuestion): Promise<QuestionRow | null> {
    const scopedEntityId = trimResourceId(values.entityId);
    if (scopedEntityId === undefined) return null;
    const id =
      values.id === undefined
        ? undefined
        : (trimResourceId(values.id) ?? undefined);
    const [created] = await exec
      .insert(questions)
      .values({ ...values, id, entityId: scopedEntityId })
      .returning(questionColumns);
    return created ?? null;
  },

  async update(
    exec: DbExec,
    questionId: string,
    patch: QuestionPatch
  ): Promise<QuestionRow | null> {
    const scopedQuestionId = trimResourceId(questionId);
    if (scopedQuestionId === undefined) return null;
    const [updated] = await exec
      .update(questions)
      .set(patch)
      .where(eq(questions.id, scopedQuestionId))
      .returning(questionColumns);
    return updated ?? null;
  },

  async updateInCase(
    exec: DbExec,
    caseId: CaseId,
    questionId: string,
    patch: QuestionPatch
  ): Promise<QuestionRow | null> {
    const scoped = trimScopedCaseIds(caseId, questionId);
    if (!scoped) return null;
    const [updated] = await exec
      .update(questions)
      .set(patch)
      .where(
        and(
          eq(questions.id, scoped.resourceId),
          entityRowInCase(questions.entityId, scoped.caseId)
        )
      )
      .returning(questionColumns);
    return updated ?? null;
  },

  async resolve(
    exec: DbExec,
    questionId: string,
    values: ResolveQuestionValues
  ): Promise<QuestionRow | null> {
    const scopedQuestionId = trimResourceId(questionId);
    if (scopedQuestionId === undefined) return null;
    const [row] = await exec
      .update(questions)
      .set({
        status: "resolved",
        resolvedNote: values.resolvedNote,
      })
      .where(eq(questions.id, scopedQuestionId))
      .returning(questionColumns);
    return row ?? null;
  },

  /**
   * Resolve a still-open Question in the Case. The `open` check is part of the
   * UPDATE, so of two concurrent resolves only one matches a row; `null` also
   * covers an already resolved Question (the caller tells that from a miss).
   */
  async resolveInCase(
    exec: DbExec,
    caseId: CaseId,
    questionId: string,
    values: ResolveQuestionValues
  ): Promise<QuestionRow | null> {
    const scoped = trimScopedCaseIds(caseId, questionId);
    if (!scoped) return null;
    const [row] = await exec
      .update(questions)
      .set({
        status: "resolved",
        resolvedNote: values.resolvedNote,
      })
      .where(
        and(
          eq(questions.id, scoped.resourceId),
          entityRowInCase(questions.entityId, scoped.caseId),
          eq(questions.status, "open")
        )
      )
      .returning(questionColumns);
    return row ?? null;
  },

  /** Reopen a resolved Question in the Case; `null` when it is missing or already open. */
  async reopenInCase(
    exec: DbExec,
    caseId: CaseId,
    questionId: string
  ): Promise<QuestionRow | null> {
    const scoped = trimScopedCaseIds(caseId, questionId);
    if (!scoped) return null;
    const [row] = await exec
      .update(questions)
      .set({ status: "open", resolvedNote: null })
      .where(
        and(
          eq(questions.id, scoped.resourceId),
          entityRowInCase(questions.entityId, scoped.caseId),
          eq(questions.status, "resolved")
        )
      )
      .returning(questionColumns);
    return row ?? null;
  },

  async delete(exec: DbExec, questionId: string): Promise<QuestionRow | null> {
    const scopedQuestionId = trimResourceId(questionId);
    if (scopedQuestionId === undefined) return null;
    const [deleted] = await exec
      .delete(questions)
      .where(eq(questions.id, scopedQuestionId))
      .returning(questionColumns);
    return deleted ?? null;
  },

  async deleteInCase(
    exec: DbExec,
    caseId: CaseId,
    questionId: string
  ): Promise<QuestionRow | null> {
    const scoped = trimScopedCaseIds(caseId, questionId);
    if (!scoped) return null;
    const [deleted] = await exec
      .delete(questions)
      .where(
        and(
          eq(questions.id, scoped.resourceId),
          entityRowInCase(questions.entityId, scoped.caseId)
        )
      )
      .returning(questionColumns);
    return deleted ?? null;
  },
};
