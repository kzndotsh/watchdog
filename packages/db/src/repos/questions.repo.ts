import { and, asc, eq, inArray } from "drizzle-orm";

import {
  normalizeUuidList,
  trimmedOrNull,
  trimmedOrUndefined,
} from "@watchdog/schemas";

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

function questionTextForWrite(text: string): string | undefined {
  return trimmedOrUndefined(text);
}

function questionPatchForWrite(patch: QuestionPatch): QuestionPatch | null {
  const next: QuestionPatch = { ...patch };
  if (patch.text !== undefined) {
    const text = questionTextForWrite(patch.text);
    if (text === undefined) return null;
    next.text = text;
  }
  if (patch.resolvedNote !== undefined) {
    next.resolvedNote = trimmedOrNull(patch.resolvedNote);
  }
  return next;
}

function resolveNoteForWrite(resolvedNote: string | null): string | null {
  return trimmedOrNull(resolvedNote);
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
    caseId: string,
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
    caseId: string,
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
    const text = questionTextForWrite(values.text);
    if (text === undefined) return null;
    const id =
      values.id === undefined
        ? undefined
        : (trimResourceId(values.id) ?? undefined);
    const [created] = await exec
      .insert(questions)
      .values({ ...values, id, entityId: scopedEntityId, text })
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
    const normalizedPatch = questionPatchForWrite(patch);
    if (normalizedPatch === null) return null;
    const [updated] = await exec
      .update(questions)
      .set(normalizedPatch)
      .where(eq(questions.id, scopedQuestionId))
      .returning(questionColumns);
    return updated ?? null;
  },

  async updateInCase(
    exec: DbExec,
    caseId: string,
    questionId: string,
    patch: QuestionPatch
  ): Promise<QuestionRow | null> {
    const scoped = trimScopedCaseIds(caseId, questionId);
    if (!scoped) return null;
    const normalizedPatch = questionPatchForWrite(patch);
    if (normalizedPatch === null) return null;
    const [updated] = await exec
      .update(questions)
      .set(normalizedPatch)
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
        resolvedNote: resolveNoteForWrite(values.resolvedNote),
      })
      .where(eq(questions.id, scopedQuestionId))
      .returning(questionColumns);
    return row ?? null;
  },

  async resolveInCase(
    exec: DbExec,
    caseId: string,
    questionId: string,
    values: ResolveQuestionValues
  ): Promise<QuestionRow | null> {
    const scoped = trimScopedCaseIds(caseId, questionId);
    if (!scoped) return null;
    const [row] = await exec
      .update(questions)
      .set({
        status: "resolved",
        resolvedNote: resolveNoteForWrite(values.resolvedNote),
      })
      .where(
        and(
          eq(questions.id, scoped.resourceId),
          entityRowInCase(questions.entityId, scoped.caseId)
        )
      )
      .returning(questionColumns);
    return row ?? null;
  },
};
