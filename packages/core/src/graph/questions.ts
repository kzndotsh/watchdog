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
import { tryDb, tryDbWith, requireWritten } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import {
  ConflictError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import {
  appendGraphActivityEffect,
  dossierHistory,
  setHistoryContextEffect,
  graphActorFields,
  type GraphActor,
} from "./graph-activity";
import {
  assertCaseInOrgEffect,
  assertEntityInCaseEffect,
  missedUpdateEffect,
  requireTrimmedGraphId,
} from "./patch/guards";

export type QuestionRecord = {
  id: string;
  entityId: string;
  text: string;
  status: QuestionStatus;
  resolvedNote: string | null;
};

export type CreateQuestionInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  entityId: string;
  text: string;
} & GraphActor;

export type ResolveQuestionInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  questionId: string;
  resolvedNote?: string;
} & GraphActor;

export type UpdateQuestionInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  questionId: string;
  text?: string;
  resolvedNote?: string | null;
} & GraphActor;

export type ReopenQuestionInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  questionId: string;
} & GraphActor;

const DEFAULT_QUESTIONS: Partial<Record<EntityKind, readonly string[]>> = {
  person: [
    "What do they do for work?",
    "When did this identity start, and is it current?",
    "What other handles / accounts?",
    "Any emails, phones, or URLs?",
    "What in that is externally searchable?",
  ],
};

type SeedQuestionEntity = {
  id: string;
  kind: EntityKind;
};

export function seedDefaultQuestionsEffect(
  tx: DbExec,
  row: SeedQuestionEntity
): Effect.Effect<void, DomainTag> {
  const texts = DEFAULT_QUESTIONS[row.kind];
  if (!texts) return Effect.void;
  return Effect.gen(function* seedDefaultQuestionsGen() {
    yield* Effect.forEach(
      texts,
      (text) =>
        tryDb(() =>
          questionsRepo.create(tx, {
            entityId: row.id,
            text,
            status: "open",
          })
        ).pipe(requireWritten(`seed ${row.kind} Questions`)),
      { concurrency: "unbounded", discard: true }
    );
  });
}

/** A conditional status UPDATE matched nothing: Conflict if the Question exists, else NotFound. */
function questionMissEffect(
  tx: DbExec,
  caseId: CaseId,
  questionId: string,
  conflictReason: string
): Effect.Effect<never, DomainTag> {
  return Effect.gen(function* questionMissGen() {
    const current = yield* tryDb(() =>
      questionsRepo.getInCase(tx, caseId, questionId)
    );
    return yield* missedUpdateEffect(
      current !== null,
      { entity: "Question", id: questionId },
      conflictReason
    );
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
        yield* setHistoryContextEffect(tx, dossierHistory(input));
        const created = yield* tryDb(() =>
          questionsRepo.create(tx, {
            entityId,
            text,
            status: "open",
          })
        ).pipe(requireWritten("create Question"));
        yield* appendGraphActivityEffect(tx, {
          ...graphActorFields(input),
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
        yield* setHistoryContextEffect(tx, dossierHistory(input));
        const resolved = yield* tryDb(() =>
          questionsRepo.resolveInCase(tx, scopedCaseId, questionId, {
            resolvedNote: trimmedOrNull(input.resolvedNote),
          })
        );
        if (!resolved) {
          return yield* questionMissEffect(
            tx,
            scopedCaseId,
            questionId,
            "Question already resolved"
          );
        }
        yield* appendGraphActivityEffect(tx, {
          ...graphActorFields(input),
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
        yield* setHistoryContextEffect(tx, dossierHistory(input));
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
          ...graphActorFields(input),
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
        yield* setHistoryContextEffect(tx, dossierHistory(input));
        const reopened = yield* tryDb(() =>
          questionsRepo.reopenInCase(tx, scopedCaseId, questionId)
        );
        if (!reopened) {
          return yield* questionMissEffect(
            tx,
            scopedCaseId,
            questionId,
            "Question is already open"
          );
        }
        yield* appendGraphActivityEffect(tx, {
          ...graphActorFields(input),
          caseId: scopedCaseId,
          kind: "question",
          action: "updated",
          subjectId: reopened.id,
          label: reopened.text,
          fromValue: "resolved",
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
  questionId: string,
  actor?: GraphActor
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
        yield* setHistoryContextEffect(tx, dossierHistory(actor));
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
          ...graphActorFields(actor),
          caseId: scopedCaseId,
          kind: "question",
          action: "deleted",
          subjectId: normalizedQuestionId,
          label: deleted.text,
        });
      })
    );
  });
}
