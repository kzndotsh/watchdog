import { Effect } from "effect";

import type { DbExec } from "@watchdog/db";
import type {
  CaseId,
  EntityKind,
  OrganizationId,
  Page,
  GraphActor,
} from "@watchdog/schemas/shared";
import { trimmedOrNull, trimmedOrUndefined } from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { pageWindow, toPage } from "../infra/page";
import type { PageRequest } from "../infra/page";
import { requireWritten } from "../infra/postgres-effect";
import { questionsRepoFx, questionsRepoFxDb } from "../infra/repos-fx";
import { InvalidError, type DomainTag } from "../infra/tagged-errors";
import { dossierChannel } from "./graph-activity";
import { runGraphMutation } from "./mutation/run-graph-mutation";
import {
  questionsTable,
  reopenQuestion,
  resolveQuestion,
  toQuestionRecord,
  type QuestionRecord,
} from "./mutation/tables";
import {
  assertCaseInOrgEffect,
  assertEntityInCaseEffect,
  requireTrimmedGraphId,
} from "./patch/guards";

export type { QuestionRecord };

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
  /** The `version` the caller last read; an update of a row that moved on is `StaleVersionError`. */
  expectedVersion: number;
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
        questionsRepoFx
          .create(tx, {
            entityId: row.id,
            caseId: row.caseId,
            text,
            status: "open",
          })
          .pipe(requireWritten(`seed ${row.kind} Questions`)),
      { concurrency: "unbounded", discard: true }
    );
  });
}

/** One page of an Entity's Questions, oldest first. */
export function listQuestionsForEntityEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  entityId: string,
  page: PageRequest = {}
): Effect.Effect<Page<QuestionRecord>, DomainTag, Db> {
  return Effect.gen(function* listQuestionsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedEntityId = yield* requireTrimmedGraphId(entityId, "Entity");
    yield* assertEntityInCaseEffect(scopedCaseId, normalizedEntityId);
    const window = yield* pageWindow(page, {
      list: "questions",
      keys: ["time"],
    });
    const rows = yield* questionsRepoFxDb.listForEntity(normalizedEntityId, {
      limit: window.limit + 1,
      ...(window.after === undefined ? {} : { after: window.after }),
    });
    return toPage(rows, window, toQuestionRecord, (row) => ({
      id: row.id,
      values: [row.keyTime],
    }));
  });
}

export function createQuestionEffect(
  input: CreateQuestionInput
): Effect.Effect<QuestionRecord, DomainTag, Db> {
  return runGraphMutation(
    {
      caseId: input.caseId,
      organizationId: input.organizationId,
      actor: input,
      channel: dossierChannel(input),
    },
    (w) =>
      Effect.gen(function* createQuestionGen() {
        const entityId = yield* requireTrimmedGraphId(input.entityId, "Entity");
        yield* assertEntityInCaseEffect(w.caseId, entityId, w.tx);
        const text = trimmedOrUndefined(input.text);
        if (text === undefined) {
          return yield* new InvalidError({
            reason: "Question text is required",
          });
        }
        return yield* w.insert(questionsTable, {
          entityId,
          text,
          status: "open",
        });
      })
  );
}

export function resolveQuestionEffect(
  input: ResolveQuestionInput
): Effect.Effect<QuestionRecord, DomainTag, Db> {
  return runGraphMutation(
    {
      caseId: input.caseId,
      organizationId: input.organizationId,
      actor: input,
      channel: dossierChannel(input),
    },
    (w) =>
      w.transition(questionsTable, input.questionId, resolveQuestion, {
        resolvedNote: trimmedOrNull(input.resolvedNote),
      })
  );
}

export function updateQuestionEffect(
  input: UpdateQuestionInput
): Effect.Effect<QuestionRecord, DomainTag, Db> {
  return runGraphMutation(
    {
      caseId: input.caseId,
      organizationId: input.organizationId,
      actor: input,
      channel: dossierChannel(input),
    },
    (w) =>
      Effect.gen(function* updateQuestionGen() {
        const existing = yield* w.get(questionsTable, input.questionId);
        if (input.text === undefined && input.resolvedNote === undefined) {
          return yield* new InvalidError({ reason: "Nothing to update" });
        }
        if (
          input.resolvedNote !== undefined &&
          existing.status !== "resolved"
        ) {
          return yield* new InvalidError({
            reason: "Resolved note only applies to resolved Questions",
          });
        }
        const nextText =
          input.text === undefined ? undefined : trimmedOrUndefined(input.text);
        if (input.text !== undefined && nextText === undefined) {
          return yield* new InvalidError({
            reason: "Question text is required",
          });
        }
        return yield* w.update(
          questionsTable,
          existing.id,
          {
            ...(nextText === undefined ? {} : { text: nextText }),
            ...(input.resolvedNote === undefined
              ? {}
              : { resolvedNote: trimmedOrNull(input.resolvedNote) }),
          },
          { expectedVersion: input.expectedVersion }
        );
      })
  );
}

export function reopenQuestionEffect(
  input: ReopenQuestionInput
): Effect.Effect<QuestionRecord, DomainTag, Db> {
  return runGraphMutation(
    {
      caseId: input.caseId,
      organizationId: input.organizationId,
      actor: input,
      channel: dossierChannel(input),
    },
    (w) => w.transition(questionsTable, input.questionId, reopenQuestion, null)
  );
}

export function deleteQuestionEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  questionId: string,
  actor?: GraphActor
): Effect.Effect<void, DomainTag, Db> {
  return runGraphMutation(
    { caseId, organizationId, actor, channel: dossierChannel(actor) },
    (w) => Effect.asVoid(w.remove(questionsTable, questionId))
  );
}
