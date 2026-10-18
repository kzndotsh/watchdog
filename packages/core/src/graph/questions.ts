import { Effect } from "effect";

import { questionsRepo, type DbExec, type QuestionRow } from "@watchdog/db";
import type {
  CaseId,
  EntityKind,
  GraphHistoryChannel,
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
  graphActorFields,
  type GraphActor,
} from "./graph-activity";
import {
  captureGraphRowEffect,
  recordGraphHistoryEffect,
} from "./graph-history";
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
  caseId: CaseId;
  kind: EntityKind;
};

/** Who seeds the default Questions of a new Entity: the creator, through the channel that made it. */
export type SeedQuestionActor = {
  actorId?: string | null;
  actorLabel?: string | null;
  channel?: GraphHistoryChannel;
};

/**
 * Seeds the default Questions of a new Entity. Each is a Graph row: it is
 * attributed to the creator and gets its own `create` history row (the
 * activity log gets one entry, the Entity's, from the caller).
 */
export function seedDefaultQuestionsEffect(
  tx: DbExec,
  row: SeedQuestionEntity,
  actor: SeedQuestionActor
): Effect.Effect<void, DomainTag> {
  const texts = DEFAULT_QUESTIONS[row.kind];
  if (!texts) return Effect.void;
  return Effect.gen(function* seedDefaultQuestionsGen() {
    yield* Effect.forEach(
      texts,
      (text) =>
        Effect.gen(function* seedQuestionGen() {
          const created = yield* tryDb(() =>
            questionsRepo.create(tx, {
              entityId: row.id,
              text,
              status: "open",
              createdBy: actor.actorId,
              updatedBy: actor.actorId ?? null,
            })
          ).pipe(requireWritten(`seed ${row.kind} Questions`));
          yield* recordGraphHistoryEffect(tx, {
            ...actor,
            caseId: row.caseId,
            kind: "question",
            rowId: created.id,
            op: "create",
            before: null,
          });
        }),
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
    const actor = graphActorFields(input);
    const actorId = actor.actorId;
    const row = yield* transact((tx) =>
      Effect.gen(function* createQuestionTx() {
        const created = yield* tryDb(() =>
          questionsRepo.create(tx, {
            entityId,
            text,
            status: "open",
            createdBy: actorId,
            updatedBy: actorId ?? null,
          })
        ).pipe(requireWritten("create Question"));
        yield* appendGraphActivityEffect(tx, {
          ...actor,
          caseId: scopedCaseId,
          kind: "question",
          action: "created",
          subjectId: created.id,
          label: created.text,
          history: { before: null },
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

    const actor = graphActorFields(input);
    const row = yield* transact((tx) =>
      Effect.gen(function* resolveQuestionTx() {
        const before = yield* captureGraphRowEffect(tx, "question", questionId);
        const resolved = yield* tryDb(() =>
          questionsRepo.resolveInCase(tx, scopedCaseId, questionId, {
            resolvedNote: trimmedOrNull(input.resolvedNote),
            updatedBy: actor.actorId ?? null,
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
          ...actor,
          caseId: scopedCaseId,
          kind: "question",
          action: "resolved",
          subjectId: resolved.id,
          label: resolved.text,
          fromValue: "open",
          toValue: "resolved",
          history: { before },
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

    const actor = graphActorFields(input);
    const row = yield* transact((tx) =>
      Effect.gen(function* updateQuestionTx() {
        const before = yield* captureGraphRowEffect(tx, "question", questionId);
        const updated = yield* tryDb(() =>
          questionsRepo.updateInCase(tx, scopedCaseId, questionId, {
            ...(nextText === undefined ? {} : { text: nextText }),
            ...(input.resolvedNote === undefined
              ? {}
              : { resolvedNote: trimmedOrNull(input.resolvedNote) }),
            updatedBy: actor.actorId ?? null,
          })
        );
        if (!updated) {
          return yield* new NotFoundError({
            entity: "Question",
            id: questionId,
          });
        }
        yield* appendGraphActivityEffect(tx, {
          ...actor,
          caseId: scopedCaseId,
          kind: "question",
          action: "updated",
          subjectId: updated.id,
          label: updated.text,
          history: { before },
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

    const actor = graphActorFields(input);
    const row = yield* transact((tx) =>
      Effect.gen(function* reopenQuestionTx() {
        const before = yield* captureGraphRowEffect(tx, "question", questionId);
        const reopened = yield* tryDb(() =>
          questionsRepo.reopenInCase(
            tx,
            scopedCaseId,
            questionId,
            actor.actorId
          )
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
          ...actor,
          caseId: scopedCaseId,
          kind: "question",
          action: "updated",
          subjectId: reopened.id,
          label: reopened.text,
          fromValue: "resolved",
          toValue: "open",
          history: { before },
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
        const before = yield* captureGraphRowEffect(
          tx,
          "question",
          normalizedQuestionId
        );
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
          history: { before },
        });
      })
    );
  });
}
