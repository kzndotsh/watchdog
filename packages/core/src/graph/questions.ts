import { Effect } from "effect";

import {
  db,
  questionsRepo,
  type DbExec,
  type QuestionRow,
} from "@watchdog/db";
import type { EntityKind, QuestionStatus } from "@watchdog/schemas";

import { notifyEntityChangedEffect } from "../infra/events";
import { tryDb } from "../infra/postgres-effect";
import {
  ConflictError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { assertCaseInOrgEffect, assertEntityInCaseEffect } from "./patch/guards";

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
    yield* assertCaseInOrgEffect(caseId, organizationId);
    yield* assertEntityInCaseEffect(caseId, entityId, db);
    const rows = yield* tryDb(() =>
      questionsRepo.listForEntity(db, entityId)
    );
    return rows.map(toRecord);
  });
}

export function createQuestionEffect(
  input: CreateQuestionInput
): Effect.Effect<QuestionRecord, DomainTag> {
  return Effect.gen(function* createQuestionGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    yield* assertEntityInCaseEffect(input.caseId, input.entityId, db);
    const row = yield* tryDb(() =>
      questionsRepo.create(db, {
        entityId: input.entityId,
        text: input.text,
        status: "open",
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to create Question" });
    }
    yield* notifyEntityChangedEffect(input.caseId);
    return toRecord(row);
  });
}

export function resolveQuestionEffect(
  input: ResolveQuestionInput
): Effect.Effect<QuestionRecord, DomainTag> {
  return Effect.gen(function* resolveQuestionGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    const existing = yield* tryDb(() =>
      questionsRepo.getInCase(db, input.caseId, input.questionId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Question not found" });
    }
    if (existing.status === "resolved") {
      return yield* new ConflictError({ reason: "Question already resolved" });
    }

    const row = yield* tryDb(() =>
      questionsRepo.resolve(db, input.questionId, {
        resolvedNote: input.resolvedNote ?? null,
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to resolve Question" });
    }
    yield* notifyEntityChangedEffect(input.caseId);
    return toRecord(row);
  });
}

export function updateQuestionEffect(
  input: UpdateQuestionInput
): Effect.Effect<QuestionRecord, DomainTag> {
  return Effect.gen(function* updateQuestionGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    const existing = yield* tryDb(() =>
      questionsRepo.getInCase(db, input.caseId, input.questionId)
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

    const row = yield* tryDb(() =>
      questionsRepo.update(db, input.questionId, {
        ...(input.text === undefined ? {} : { text: input.text }),
        ...(input.resolvedNote === undefined
          ? {}
          : { resolvedNote: input.resolvedNote }),
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to update Question" });
    }
    yield* notifyEntityChangedEffect(input.caseId);
    return toRecord(row);
  });
}

export function reopenQuestionEffect(
  input: ReopenQuestionInput
): Effect.Effect<QuestionRecord, DomainTag> {
  return Effect.gen(function* reopenQuestionGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    const existing = yield* tryDb(() =>
      questionsRepo.getInCase(db, input.caseId, input.questionId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Question not found" });
    }
    if (existing.status === "open") {
      return yield* new ConflictError({ reason: "Question is already open" });
    }

    const row = yield* tryDb(() =>
      questionsRepo.update(db, input.questionId, {
        status: "open",
        resolvedNote: null,
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to reopen Question" });
    }
    yield* notifyEntityChangedEffect(input.caseId);
    return toRecord(row);
  });
}
