import { Effect } from "effect";

import {
  db,
  questionsRepo,
  type DbExec,
  type QuestionRow,
} from "@watchdog/db";
import type { EntityKind, QuestionStatus } from "@watchdog/schemas";
import { trimmedOrNull, trimmedOrUndefined } from "@watchdog/schemas";

import { notifyEntityChangedEffect } from "../infra/events";
import { tryDb } from "../infra/postgres-effect";
import {
  ConflictError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { assertCaseInOrgEffect, assertEntityInCaseEffect, requireTrimmedGraphId } from "./patch/guards";

export interface QuestionRecord {
  id: string;
  entityId: string;
  text: string;
  status: QuestionStatus;
  resolvedNote: string | null;
}

export interface CreateQuestionInput {
  caseId: string;
  organizationId: string;
  entityId: string;
  text: string;
}

export interface ResolveQuestionInput {
  caseId: string;
  organizationId: string;
  questionId: string;
  resolvedNote?: string;
}

export interface UpdateQuestionInput {
  caseId: string;
  organizationId: string;
  questionId: string;
  text?: string;
  resolvedNote?: string | null;
}

export interface ReopenQuestionInput {
  caseId: string;
  organizationId: string;
  questionId: string;
}

const DEFAULT_QUESTIONS: Partial<Record<EntityKind, readonly string[]>> = {
  person: [
    "What do they do for work?",
    "When did this identity start, and is it current?",
    "What other handles / accounts?",
    "Any emails, phones, or URLs?",
    "What in that is externally searchable?",
  ],
};

interface SeedQuestionEntity {
  id: string;
  kind: EntityKind;
}

export function seedDefaultQuestionsEffect(
  tx: DbExec,
  row: SeedQuestionEntity
): Effect.Effect<void, DomainTag> {
  const texts = DEFAULT_QUESTIONS[row.kind];
  if (!texts) return Effect.void;
  return Effect.gen(function* seedDefaultQuestionsGen() {
    const seeded = yield* Effect.forEach(
      texts,
      (text) =>
        tryDb(() =>
          questionsRepo.create(tx, {
            entityId: row.id,
            text,
            status: "open",
          })
        ),
      { concurrency: "unbounded" }
    );
    if (seeded.some((question) => question === null)) {
      return yield* new InvalidError({
        reason: `Failed to seed ${row.kind} Questions`,
      });
    }
  });
}

function toRecord(row: QuestionRow): QuestionRecord {
  return {
    id: row.id,
    entityId: row.entityId,
    text: row.text,
    status: row.status,
    resolvedNote: row.resolvedNote ?? null,
  };
}

export function listQuestionsForEntityEffect(
  caseId: string,
  organizationId: string,
  entityId: string
): Effect.Effect<QuestionRecord[], DomainTag> {
  return Effect.gen(function* listQuestionsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedEntityId = yield* requireTrimmedGraphId(
      entityId,
      "Entity not found in this Case"
    );
    yield* assertEntityInCaseEffect(scopedCaseId, normalizedEntityId, db);
    const rows = yield* tryDb(() =>
      questionsRepo.listForEntity(db, normalizedEntityId)
    );
    return rows.map(toRecord);
  });
}

export function createQuestionEffect(
  input: CreateQuestionInput
): Effect.Effect<QuestionRecord, DomainTag> {
  return Effect.gen(function* createQuestionGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const entityId = yield* requireTrimmedGraphId(
      input.entityId,
      "Entity not found in this Case"
    );
    yield* assertEntityInCaseEffect(scopedCaseId, entityId, db);
    const text = trimmedOrUndefined(input.text);
    if (text === undefined) {
      return yield* new InvalidError({ reason: "Question text is required" });
    }
    const row = yield* tryDb(() =>
      questionsRepo.create(db, {
        entityId,
        text,
        status: "open",
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to create Question" });
    }
    yield* notifyEntityChangedEffect(scopedCaseId);
    return toRecord(row);
  });
}

export function resolveQuestionEffect(
  input: ResolveQuestionInput
): Effect.Effect<QuestionRecord, DomainTag> {
  return Effect.gen(function* resolveQuestionGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const questionId = yield* requireTrimmedGraphId(
      input.questionId,
      "Question not found"
    );
    const existing = yield* tryDb(() =>
      questionsRepo.getInCase(db, scopedCaseId, questionId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Question not found" });
    }
    if (existing.status === "resolved") {
      return yield* new ConflictError({ reason: "Question already resolved" });
    }

    const row = yield* tryDb(() =>
      questionsRepo.resolveInCase(db, scopedCaseId, questionId, {
        resolvedNote: trimmedOrNull(input.resolvedNote),
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to resolve Question" });
    }
    yield* notifyEntityChangedEffect(scopedCaseId);
    return toRecord(row);
  });
}

export function updateQuestionEffect(
  input: UpdateQuestionInput
): Effect.Effect<QuestionRecord, DomainTag> {
  return Effect.gen(function* updateQuestionGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const questionId = yield* requireTrimmedGraphId(
      input.questionId,
      "Question not found"
    );
    const existing = yield* tryDb(() =>
      questionsRepo.getInCase(db, scopedCaseId, questionId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Question not found" });
    }

    if (input.text === undefined && input.resolvedNote === undefined) {
      return yield* new InvalidError({ reason: "Nothing to update" });
    }
    if (input.resolvedNote !== undefined && existing.status !== "resolved") {
      return yield* new InvalidError({
        reason: "Resolved note only applies to resolved Questions",
      });
    }

    const nextText =
      input.text === undefined ? undefined : trimmedOrUndefined(input.text);
    if (input.text !== undefined && nextText === undefined) {
      return yield* new InvalidError({ reason: "Question text is required" });
    }

    const row = yield* tryDb(() =>
      questionsRepo.updateInCase(db, scopedCaseId, questionId, {
        ...(nextText === undefined ? {} : { text: nextText }),
        ...(input.resolvedNote === undefined
          ? {}
          : { resolvedNote: trimmedOrNull(input.resolvedNote) }),
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to update Question" });
    }
    yield* notifyEntityChangedEffect(scopedCaseId);
    return toRecord(row);
  });
}

export function reopenQuestionEffect(
  input: ReopenQuestionInput
): Effect.Effect<QuestionRecord, DomainTag> {
  return Effect.gen(function* reopenQuestionGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const questionId = yield* requireTrimmedGraphId(
      input.questionId,
      "Question not found"
    );
    const existing = yield* tryDb(() =>
      questionsRepo.getInCase(db, scopedCaseId, questionId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Question not found" });
    }
    if (existing.status === "open") {
      return yield* new ConflictError({ reason: "Question is already open" });
    }

    const row = yield* tryDb(() =>
      questionsRepo.updateInCase(db, scopedCaseId, questionId, {
        status: "open",
        resolvedNote: null,
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to reopen Question" });
    }
    yield* notifyEntityChangedEffect(scopedCaseId);
    return toRecord(row);
  });
}

export function deleteQuestionEffect(
  caseId: string,
  organizationId: string,
  questionId: string
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* deleteQuestionGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedQuestionId = yield* requireTrimmedGraphId(
      questionId,
      "Question not found"
    );
    const existing = yield* tryDb(() =>
      questionsRepo.getInCase(db, scopedCaseId, normalizedQuestionId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Question not found" });
    }

    const deleted = yield* tryDb(() =>
      questionsRepo.deleteInCase(db, scopedCaseId, normalizedQuestionId)
    );
    if (!deleted) {
      return yield* new InvalidError({ reason: "Failed to delete Question" });
    }
    yield* notifyEntityChangedEffect(scopedCaseId);
  });
}
