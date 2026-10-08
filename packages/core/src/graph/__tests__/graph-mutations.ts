import { Effect } from "effect";

import { updateCaseEffect } from "@watchdog/core/cases";
import type { DomainTag } from "@watchdog/core/errors";
import {
  applyPatchEffect,
  createClaimEffect,
  createEdgeEffect,
  createEntityEffect,
  createEventEffect,
  createIdentifierEffect,
  createQuestionEffect,
  deleteEdgeEffect,
  deleteEntityEffect,
  deleteEventEffect,
  deleteIdentifierEffect,
  deleteQuestionEffect,
  reopenQuestionEffect,
  resolveQuestionEffect,
  retractClaimEffect,
  updateClaimEffect,
  updateEdgeEffect,
  updateEntityFieldsEffect,
  updateEventEffect,
  updateIdentifierEffect,
  updateQuestionEffect,
} from "@watchdog/core/graph";
import { runDomain, type Db } from "@watchdog/core/infra";
import { db } from "@watchdog/db";
import type { ActivityEntryKind } from "@watchdog/schemas/feed";
import type { CaseId } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { seedCase, seedEntity } from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

/**
 * The registry of Graph and Case mutations (ADR-0005 S4, decision 2: "a gate
 * test lists the domain mutations and asserts each appends").
 *
 * Two tests read it:
 * - `graph-activity-gate.test.ts` scans core's production source for every
 *   function that calls a Graph repo write and fails unless the function is
 *   listed here (`sites`) or exempted below with a reason. A new mutation that
 *   forgets to register fails the build.
 * - `graph-activity.int.test.ts` runs every entry against a real database and
 *   asserts it appends exactly one entry of the declared kind and action.
 *
 * A site key is `<path under packages/core/src>#<function name>`.
 */

export interface GraphFixture {
  caseId: CaseId;
  organizationId: typeof TEST_ORGANIZATION_ID;
  entityId: string;
  otherEntityId: string;
  edgeId: string;
  claimId: string;
  identifierId: string;
  eventId: string;
  questionId: string;
  resolvedQuestionId: string;
}

/** Seeds a Case with two Entities and one row of every Graph kind (no entries are asserted on setup). */
export async function seedGraphFixture(): Promise<GraphFixture> {
  const cased = await seedCase(db);
  const base = { caseId: cased.id, organizationId: TEST_ORGANIZATION_ID };
  const entity = await seedEntity(db, cased.id, {
    id: testId(20),
    name: "Ada Lovelace",
    slug: "ada",
  });
  const other = await seedEntity(db, cased.id, {
    id: testId(21),
    name: "Charles Babbage",
    slug: "charles",
  });
  const edge = await runDomain(
    createEdgeEffect({
      ...base,
      fromId: entity.id,
      toId: other.id,
      predicate: "related_to",
      confidence: "unverified",
      notes: "correspondents",
    })
  );
  const claim = await runDomain(
    createClaimEffect({
      ...base,
      entityId: entity.id,
      text: "Wrote the first program",
      confidence: "unverified",
      class: "observation",
    })
  );
  const identifier = await runDomain(
    createIdentifierEffect({
      ...base,
      entityId: entity.id,
      type: "email",
      value: "ada@mailhost.test",
      confidence: "unverified",
      status: "unknown",
    })
  );
  const event = await runDomain(
    createEventEffect({
      ...base,
      entityId: entity.id,
      when: "1815-12-10",
      what: "Born",
    })
  );
  const question = await runDomain(
    createQuestionEffect({
      ...base,
      entityId: entity.id,
      text: "Where did she live?",
    })
  );
  const toResolve = await runDomain(
    createQuestionEffect({
      ...base,
      entityId: entity.id,
      text: "Who funded the engine?",
    })
  );
  const resolved = await runDomain(
    resolveQuestionEffect({
      ...base,
      questionId: toResolve.id,
      resolvedNote: "The Crown",
    })
  );
  return {
    caseId: cased.id,
    organizationId: TEST_ORGANIZATION_ID,
    entityId: entity.id,
    otherEntityId: other.id,
    edgeId: edge.id,
    claimId: claim.id,
    identifierId: identifier.id,
    eventId: event.id,
    questionId: question.id,
    resolvedQuestionId: resolved.id,
  };
}

export interface GraphMutation {
  /** `<resource>.<verb>` for the report. */
  name: string;
  /** Production functions holding the repo write this mutation exercises. */
  sites: readonly string[];
  kind: ActivityEntryKind;
  action: string;
  /** How many entries the run appends (default 1). */
  entries?: number;
  /** The id `subject_id` must hold; `result` is what `run` returned (a created row). */
  subjectId: (fx: GraphFixture, result: unknown) => string;
  run: (fx: GraphFixture) => Effect.Effect<unknown, DomainTag, Db>;
}

/** The `id` of a created record returned by a mutation. */
export function resultId(result: unknown): string {
  if (
    typeof result === "object" &&
    result !== null &&
    "id" in result &&
    typeof result.id === "string"
  ) {
    return result.id;
  }
  throw new TypeError("mutation did not return a record with an id");
}

/** Every mutation runs as the same caller; each entry must carry it. */
const ACTOR = { actorId: TEST_ACTOR_ID } as const;

function scope(fx: GraphFixture) {
  return {
    caseId: fx.caseId,
    organizationId: fx.organizationId,
    ...ACTOR,
  };
}

function patch(
  fx: GraphFixture,
  op: Parameters<typeof applyPatchEffect>[0]["patch"][number]
) {
  return applyPatchEffect({
    caseId: fx.caseId,
    patch: [op],
    confidence: "unverified",
    actorId: TEST_ACTOR_ID,
  });
}

const NEW_ID = testId(60);

export const GRAPH_MUTATIONS: readonly GraphMutation[] = [
  {
    name: "entity.create",
    sites: ["graph/entities.ts#createEntityEffect"],
    kind: "entity",
    action: "created",
    subjectId: (_fx, result) => resultId(result),
    run: (fx) =>
      createEntityEffect({
        ...scope(fx),
        kind: "person",
        name: "Grace Hopper",
        slug: "grace",
      }),
  },
  {
    name: "entity.update",
    sites: ["graph/entities.ts#updateEntityFieldsEffect"],
    kind: "entity",
    action: "updated",
    subjectId: (fx) => fx.entityId,
    run: (fx) =>
      updateEntityFieldsEffect({
        ...scope(fx),
        entityId: fx.entityId,
        summary: "Mathematician",
      }),
  },
  {
    name: "entity.delete",
    sites: ["graph/entities.ts#deleteEntityEffect"],
    kind: "entity",
    action: "deleted",
    subjectId: (fx) => fx.otherEntityId,
    run: (fx) =>
      deleteEntityEffect(fx.caseId, fx.organizationId, fx.otherEntityId, ACTOR),
  },
  {
    name: "edge.create",
    sites: ["graph/edges.ts#createEdgeEffect"],
    kind: "edge",
    action: "created",
    subjectId: (_fx, result) => resultId(result),
    run: (fx) =>
      createEdgeEffect({
        ...scope(fx),
        fromId: fx.otherEntityId,
        toId: fx.entityId,
        predicate: "related_to",
        confidence: "unverified",
        notes: "reverse link",
      }),
  },
  {
    name: "edge.update",
    sites: ["graph/edges.ts#updateEdgeEffect"],
    kind: "edge",
    action: "updated",
    subjectId: (fx) => fx.edgeId,
    run: (fx) =>
      updateEdgeEffect({ ...scope(fx), edgeId: fx.edgeId, notes: "updated" }),
  },
  {
    name: "edge.delete",
    sites: ["graph/edges.ts#deleteEdgeEffect"],
    kind: "edge",
    action: "deleted",
    subjectId: (fx) => fx.edgeId,
    run: (fx) =>
      deleteEdgeEffect(fx.caseId, fx.organizationId, fx.edgeId, ACTOR),
  },
  {
    name: "claim.create",
    sites: ["graph/claims.ts#createClaimEffect"],
    kind: "claim",
    action: "created",
    subjectId: (_fx, result) => resultId(result),
    run: (fx) =>
      createClaimEffect({
        ...scope(fx),
        entityId: fx.entityId,
        text: "Corresponded with Babbage",
        confidence: "unverified",
        class: "observation",
      }),
  },
  {
    name: "claim.update",
    sites: ["graph/claims.ts#updateClaimEffect"],
    kind: "claim",
    action: "updated",
    subjectId: (fx) => fx.claimId,
    run: (fx) =>
      updateClaimEffect({ ...scope(fx), claimId: fx.claimId, text: "Edited" }),
  },
  {
    name: "claim.retract",
    sites: ["graph/claims.ts#retractClaimEffect"],
    kind: "claim",
    action: "retracted",
    subjectId: (fx) => fx.claimId,
    run: (fx) =>
      retractClaimEffect(
        {
          ...scope(fx),
          claimId: fx.claimId,
          kind: "retracted",
          reason: "Wrong person",
        },
        TEST_ACTOR_ID
      ),
  },
  {
    name: "identifier.create",
    sites: ["graph/identifiers.ts#createIdentifierEffect"],
    kind: "identifier",
    action: "created",
    subjectId: (_fx, result) => resultId(result),
    run: (fx) =>
      createIdentifierEffect({
        ...scope(fx),
        entityId: fx.entityId,
        type: "email",
        value: "lovelace@mailhost.test",
        confidence: "unverified",
        status: "unknown",
      }),
  },
  {
    name: "identifier.update",
    sites: ["graph/identifiers.ts#updateIdentifierEffect"],
    kind: "identifier",
    action: "updated",
    subjectId: (fx) => fx.identifierId,
    run: (fx) =>
      updateIdentifierEffect({
        ...scope(fx),
        identifierId: fx.identifierId,
        status: "current",
      }),
  },
  {
    name: "identifier.delete",
    sites: ["graph/identifiers.ts#deleteIdentifierEffect"],
    kind: "identifier",
    action: "deleted",
    subjectId: (fx) => fx.identifierId,
    run: (fx) =>
      deleteIdentifierEffect(
        fx.caseId,
        fx.organizationId,
        fx.identifierId,
        ACTOR
      ),
  },
  {
    name: "event.create",
    sites: ["graph/events-timeline.ts#createEventEffect"],
    kind: "event",
    action: "created",
    subjectId: (_fx, result) => resultId(result),
    run: (fx) =>
      createEventEffect({
        ...scope(fx),
        entityId: fx.entityId,
        when: "1852-11-27",
        what: "Died",
      }),
  },
  {
    name: "event.update",
    sites: ["graph/events-timeline.ts#updateEventEffect"],
    kind: "event",
    action: "updated",
    subjectId: (fx) => fx.eventId,
    run: (fx) =>
      updateEventEffect({
        ...scope(fx),
        eventId: fx.eventId,
        what: "Born in London",
      }),
  },
  {
    name: "event.delete",
    sites: ["graph/events-timeline.ts#deleteEventEffect"],
    kind: "event",
    action: "deleted",
    subjectId: (fx) => fx.eventId,
    run: (fx) =>
      deleteEventEffect(fx.caseId, fx.organizationId, fx.eventId, ACTOR),
  },
  {
    name: "question.create",
    sites: ["graph/questions.ts#createQuestionEffect"],
    kind: "question",
    action: "created",
    subjectId: (_fx, result) => resultId(result),
    run: (fx) =>
      createQuestionEffect({
        ...scope(fx),
        entityId: fx.entityId,
        text: "Who were her patrons?",
      }),
  },
  {
    name: "question.resolve",
    sites: ["graph/questions.ts#resolveQuestionEffect"],
    kind: "question",
    action: "resolved",
    subjectId: (fx) => fx.questionId,
    run: (fx) =>
      resolveQuestionEffect({
        ...scope(fx),
        questionId: fx.questionId,
        resolvedNote: "London",
      }),
  },
  {
    name: "question.update",
    sites: ["graph/questions.ts#updateQuestionEffect"],
    kind: "question",
    action: "updated",
    subjectId: (fx) => fx.questionId,
    run: (fx) =>
      updateQuestionEffect({
        ...scope(fx),
        questionId: fx.questionId,
        text: "Where did she live as a child?",
      }),
  },
  {
    name: "question.reopen",
    sites: ["graph/questions.ts#reopenQuestionEffect"],
    kind: "question",
    action: "updated",
    subjectId: (fx) => fx.resolvedQuestionId,
    run: (fx) =>
      reopenQuestionEffect({ ...scope(fx), questionId: fx.resolvedQuestionId }),
  },
  {
    name: "question.delete",
    sites: ["graph/questions.ts#deleteQuestionEffect"],
    kind: "question",
    action: "deleted",
    subjectId: (fx) => fx.questionId,
    run: (fx) =>
      deleteQuestionEffect(fx.caseId, fx.organizationId, fx.questionId, ACTOR),
  },
  {
    name: "case.update",
    sites: ["cases/cases.ts#updateCaseEffect"],
    kind: "case",
    action: "updated",
    subjectId: (fx) => fx.caseId,
    run: (fx) =>
      updateCaseEffect({
        id: fx.caseId,
        organizationId: fx.organizationId,
        ...ACTOR,
        description: "Updated description",
      }),
  },
  // The patch path (Accept and the agent graph write): one entry per op.
  {
    name: "patch.entity.create",
    sites: ["graph/patch/apply-entity-op.ts#applyEntityOpEffect"],
    kind: "entity",
    action: "created",
    subjectId: () => NEW_ID,
    run: (fx) =>
      patch(fx, {
        op: "create",
        resource: "entity",
        id: NEW_ID,
        data: { kind: "person", name: "Grace Hopper", slug: "grace" },
      }),
  },
  {
    name: "patch.entity.upsert-existing",
    sites: ["graph/patch/apply-entity-op.ts#applyEntityOpEffect"],
    kind: "entity",
    action: "updated",
    subjectId: (fx) => fx.entityId,
    run: (fx) =>
      patch(fx, {
        op: "upsert",
        resource: "entity",
        id: fx.entityId,
        data: { kind: "person", name: "Ada King", slug: "ada" },
      }),
  },
  {
    name: "patch.entity.update",
    sites: ["graph/patch/apply-entity-op.ts#applyEntityOpEffect"],
    kind: "entity",
    action: "updated",
    subjectId: (fx) => fx.entityId,
    run: (fx) =>
      patch(fx, {
        op: "update",
        resource: "entity",
        id: fx.entityId,
        data: { summary: "Patched" },
      }),
  },
  {
    name: "patch.claim.create",
    sites: ["graph/patch/apply-claim-op.ts#applyClaimOpEffect"],
    kind: "claim",
    action: "created",
    subjectId: () => NEW_ID,
    run: (fx) =>
      patch(fx, {
        op: "create",
        resource: "claim",
        id: NEW_ID,
        data: { entityId: fx.entityId, text: "Patched claim" },
      }),
  },
  {
    name: "patch.edge.create",
    sites: ["graph/patch/apply-edge-op.ts#applyEdgeOpEffect"],
    kind: "edge",
    action: "created",
    subjectId: () => NEW_ID,
    run: (fx) =>
      patch(fx, {
        op: "create",
        resource: "edge",
        id: NEW_ID,
        data: {
          fromId: fx.otherEntityId,
          toId: fx.entityId,
          predicate: "related_to",
          notes: "patched",
        },
      }),
  },
  {
    name: "patch.edge.upsert-existing",
    sites: ["graph/patch/apply-edge-op.ts#applyEdgeOpEffect"],
    kind: "edge",
    action: "updated",
    subjectId: (fx) => fx.edgeId,
    run: (fx) =>
      patch(fx, {
        op: "upsert",
        resource: "edge",
        id: NEW_ID,
        data: {
          fromId: fx.entityId,
          toId: fx.otherEntityId,
          predicate: "related_to",
          notes: "patched again",
        },
      }),
  },
  {
    name: "patch.identifier.create",
    sites: ["graph/patch/apply-identifier-op.ts#applyIdentifierOpEffect"],
    kind: "identifier",
    action: "created",
    subjectId: () => NEW_ID,
    run: (fx) =>
      patch(fx, {
        op: "create",
        resource: "identifier",
        id: NEW_ID,
        data: {
          entityId: fx.entityId,
          type: "email",
          value: "patched@mailhost.test",
        },
      }),
  },
  {
    name: "patch.identifier.upsert-existing",
    sites: ["graph/patch/apply-identifier-op.ts#applyIdentifierOpEffect"],
    kind: "identifier",
    action: "updated",
    subjectId: (fx) => fx.identifierId,
    run: (fx) =>
      patch(fx, {
        op: "upsert",
        resource: "identifier",
        id: NEW_ID,
        data: {
          entityId: fx.entityId,
          type: "email",
          value: "ada@mailhost.test",
          status: "current",
        },
      }),
  },
  {
    name: "patch.event.create",
    sites: ["graph/patch/apply-event-op.ts#applyEventOpEffect"],
    kind: "event",
    action: "created",
    subjectId: () => NEW_ID,
    run: (fx) =>
      patch(fx, {
        op: "create",
        resource: "event",
        id: NEW_ID,
        data: { entityId: fx.entityId, when: "1840", what: "Patched event" },
      }),
  },
  {
    name: "patch.question.create",
    sites: ["graph/patch/apply-question-op.ts#applyQuestionOpEffect"],
    kind: "question",
    action: "created",
    subjectId: () => NEW_ID,
    run: (fx) =>
      patch(fx, {
        op: "create",
        resource: "question",
        id: NEW_ID,
        data: { entityId: fx.entityId, text: "Patched question?" },
      }),
  },
];

/**
 * Functions that write a Graph repo on behalf of a registered mutation: the
 * entry point appends once in the same transaction, so the helper does not.
 */
export const GRAPH_MUTATION_HELPERS: Readonly<
  Record<string, { appendedBy: string }>
> = {
  "graph/edge-update.ts#applyValidatedEdgeUpdateEffect": {
    appendedBy: "graph/edges.ts#updateEdgeEffect",
  },
  "graph/questions.ts#seedDefaultQuestionsEffect": {
    appendedBy: "graph/entities.ts#createEntityEffect",
  },
};

/**
 * Functions that call a Graph repo write and are deliberately not mutations
 * of their own. Each needs a reason a reviewer can check.
 */
export const GRAPH_MUTATION_EXEMPTIONS: Readonly<Record<string, string>> = {
  "cases/cases.ts#createCaseEffect":
    "a new Case has no Graph and no `case.created` verb (ADR-0005 lists only `case.updated`); the Case list is not live",
  "cases/cases.ts#deleteCaseEffect":
    "Case delete is never logged (ADR-0005 decision 2): the FK cascade would remove the entry in the same transaction",
};
