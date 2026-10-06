import { Effect } from "effect";

import { questionsRepo, type DbExec, type QuestionRow } from "@watchdog/db";
import type {
  CaseId,
  EntityKind,
  OrganizationId,
  QuestionStatus,
} from "@watchdog/schemas/shared";
import { trimmedOrNull, trimmedOrUndefined } from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { tryDb, tryDbWith } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import {
  ConflictError,
  InternalError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { appendGraphActivityEffect } from "./graph-activity";
import {
  assertCaseInOrgEffect,
  assertEntityInCaseEffect,
  requireTrimmedGraphId,
} from "./patch/guards";

export interface QuestionRecord {
  id: string;
  entityId: string;
  text: string;
  status: QuestionStatus;
  resolvedNote: string | null;
}

export interface CreateQuestionInput {
  caseId: CaseId;
  organizationId: OrganizationId;
  entityId: string;
  text: string;
}

export interface ResolveQuestionInput {
  caseId: CaseId;
  organizationId: OrganizationId;
  questionId: string;
  resolvedNote?: string;
}

export interface UpdateQuestionInput {
  caseId: CaseId;
  organizationId: OrganizationId;
  questionId: string;
  text?: string;
  resolvedNote?: string | null;
}

export interface ReopenQuestionInput {
  caseId: CaseId;
  organizationId: OrganizationId;
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
      return yield* new InternalError({
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
  caseId: CaseId,
  organizationId: OrganizationId,
  entityId: string
): Effect.Effect<QuestionRecord[], DomainTag, Db> {
  return Effect.gen(function* listQuestionsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedEntityId = yield* requireTrimmedGraphId(entityId, "Entity");
    yield* assertEntityInCaseEffect(scopedCaseId, normalizedEntityId);
    const rows = yield* tryDbWith((exec) =>
      questionsRepo.listForEntity(exec, normalizedEntityId)
    );
    return rows.map(toRecord);
  });
}

export function createQuestionEffect(
  input: CreateQuestionInput
): Effect.Effect<QuestionRecord, DomainTag, Db> {
  return Effect.gen(function* createQuestionGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const entityId = yield* requireTrimmedGraphId(input.entityId, "Entity");
    yield* assertEntityInCaseEffect(scopedCaseId, entityId);
    const text = trimmedOrUndefined(input.text);
    if (text === undefined) {
      return yield* new InvalidError({ reason: "Question text is required" });
    }
    const row = yield* transact((tx) =>
      Effect.gen(function* createQuestionTx() {
        const created = yield* tryDb(() =>
          questionsRepo.create(tx, {
            entityId,
            text,
            status: "open",
          })
        );
        if (!created) {
          return yield* new InternalError({
            reason: "Failed to create Question",
          });
        }
        yield* appendGraphActivityEffect(tx, {
          caseId: scopedCaseId,
          kind: "question",
          action: "created",
          subjectId: created.id,
          label: created.text,
        });
        return created;
      })
    );
    return toRecord(row);
  });
}

export function resolveQuestionEffect(
  input: ResolveQuestionInput
): Effect.Effect<QuestionRecord, DomainTag, Db> {
  return Effect.gen(function* resolveQuestionGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const questionId = yield* requireTrimmedGraphId(
      input.questionId,
      "Question"
    );
    const existing = yield* tryDbWith((exec) =>
      questionsRepo.getInCase(exec, scopedCaseId, questionId)
    );
    if (!existing) {
      return yield* new NotFoundError({ entity: "Question", id: questionId });
    }
    if (existing.status === "resolved") {
      return yield* new ConflictError({ reason: "Question already resolved" });
    }

    const row = yield* transact((tx) =>
      Effect.gen(function* resolveQuestionTx() {
        const resolved = yield* tryDb(() =>
          questionsRepo.resolveInCase(tx, scopedCaseId, questionId, {
            resolvedNote: trimmedOrNull(input.resolvedNote),
          })
        );
        if (!resolved) {
          return yield* new NotFoundError({
            entity: "Question",
            id: questionId,
          });
        }
        yield* appendGraphActivityEffect(tx, {
          caseId: scopedCaseId,
          kind: "question",
          action: "resolved",
          subjectId: resolved.id,
          label: resolved.text,
          fromValue: "open",
          toValue: "resolved",
        });
        return resolved;
      })
    );
    return toRecord(row);
  });
}

export function updateQuestionEffect(
  input: UpdateQuestionInput
): Effect.Effect<QuestionRecord, DomainTag, Db> {
  return Effect.gen(function* updateQuestionGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const questionId = yield* requireTrimmedGraphId(
      input.questionId,
      "Question"
    );
    const existing = yield* tryDbWith((exec) =>
      questionsRepo.getInCase(exec, scopedCaseId, questionId)
    );
    if (!existing) {
      return yield* new NotFoundError({ entity: "Question", id: questionId });
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

    const row = yield* transact((tx) =>
      Effect.gen(function* updateQuestionTx() {
        const updated = yield* tryDb(() =>
          questionsRepo.updateInCase(tx, scopedCaseId, questionId, {
            ...(nextText === undefined ? {} : { text: nextText }),
            ...(input.resolvedNote === undefined
              ? {}
              : { resolvedNote: trimmedOrNull(input.resolvedNote) }),
          })
        );
        if (!updated) {
          return yield* new NotFoundError({
            entity: "Question",
            id: questionId,
          });
        }
        yield* appendGraphActivityEffect(tx, {
          caseId: scopedCaseId,
          kind: "question",
          action: "updated",
          subjectId: updated.id,
          label: updated.text,
        });
        return updated;
      })
    );
    return toRecord(row);
  });
}

export function reopenQuestionEffect(
  input: ReopenQuestionInput
): Effect.Effect<QuestionRecord, DomainTag, Db> {
  return Effect.gen(function* reopenQuestionGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const questionId = yield* requireTrimmedGraphId(
      input.questionId,
      "Question"
    );
    const existing = yield* tryDbWith((exec) =>
      questionsRepo.getInCase(exec, scopedCaseId, questionId)
    );
    if (!existing) {
      return yield* new NotFoundError({ entity: "Question", id: questionId });
    }
    if (existing.status === "open") {
      return yield* new ConflictError({ reason: "Question is already open" });
    }

    const row = yield* transact((tx) =>
      Effect.gen(function* reopenQuestionTx() {
        const reopened = yield* tryDb(() =>
          questionsRepo.updateInCase(tx, scopedCaseId, questionId, {
            status: "open",
            resolvedNote: null,
          })
        );
        if (!reopened) {
          return yield* new NotFoundError({
            entity: "Question",
            id: questionId,
          });
        }
        yield* appendGraphActivityEffect(tx, {
          caseId: scopedCaseId,
          kind: "question",
          action: "updated",
          subjectId: reopened.id,
          label: reopened.text,
          fromValue: existing.status,
          toValue: "open",
        });
        return reopened;
      })
    );
    return toRecord(row);
  });
}

export function deleteQuestionEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  questionId: string
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* deleteQuestionGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedQuestionId = yield* requireTrimmedGraphId(
      questionId,
      "Question"
    );
    const existing = yield* tryDbWith((exec) =>
      questionsRepo.getInCase(exec, scopedCaseId, normalizedQuestionId)
    );
    if (!existing) {
      return yield* new NotFoundError({
        entity: "Question",
        id: normalizedQuestionId,
      });
    }

    yield* transact((tx) =>
      Effect.gen(function* deleteQuestionTx() {
        const deleted = yield* tryDb(() =>
          questionsRepo.deleteInCase(tx, scopedCaseId, normalizedQuestionId)
        );
        if (!deleted) {
          return yield* new NotFoundError({
            entity: "Question",
            id: normalizedQuestionId,
          });
        }
        yield* appendGraphActivityEffect(tx, {
          caseId: scopedCaseId,
          kind: "question",
          action: "deleted",
          subjectId: normalizedQuestionId,
          label: existing.text,
        });
      })
    );
  });
}
