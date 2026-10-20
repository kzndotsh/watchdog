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
import {
  createTaskEffect,
  deleteTaskEffect,
  reorderTasksEffect,
  updateTaskEffect,
} from "@watchdog/core/tasks";
import { db } from "@watchdog/db";
import type { ActivityEntryKind } from "@watchdog/schemas/feed";
import type { CaseId } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { seedCase, seedEntity } from "@watchdog/test-db";
import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";

/**
 * The registry of Graph, Case and Task mutations (ADR-0005 S4): every mutation a caller can
 * make, which `graph-activity.int.test.ts` runs against a real database to assert that it
 * appends exactly one entry of the declared kind and action (and the history rows). That a
 * Graph write cannot skip the entry is the module's job and the gate's: `graph-activity-gate.test.ts`
 * fails on a Graph repo write outside `graph/mutation/`, and on a Case or Task repo write in a function that is neither a `sites` entry here nor exempted there.
 */

export type GraphFixture = {
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
  taskId: string;
  otherTaskId: string;
};

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
  const task = await runDomain(
    createTaskEffect({ ...base, title: "Request the filing" })
  );
  const otherTask = await runDomain(
    createTaskEffect({ ...base, title: "Interview the clerk" })
  );
  return {
    caseId: cased.id,
    organizationId: TEST_ORGANIZATION_ID,
    taskId: task.id,
    otherTaskId: otherTask.id,
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

export type GraphMutation = {
  /** `<resource>.<verb>` for the report. */
  name: string;
  /**
   * For a Case or Task mutation: the production function holding its repo write. The gate
   * requires every function that writes `casesRepo` or `tasksRepo` to be named here or exempted.
   */
  sites?: readonly string[];
  kind: ActivityEntryKind;
  action: string;
  /** How many entries the run appends (default 1). */
  entries?: number;
  /**
   * How many `graph_history` rows the run appends (default 1): one per changed
   * row. A Person Entity create also seeds its default Questions, and an
   * Entity delete records the rows it cascades to; a Case update changes no
   * Graph row (0).
   */
  historyRows?: number;
  /** The id `subject_id` must hold (`null` for a reorder, which has no one subject); `result` is what `run` returned (a created row). */
  subjectId: (fx: GraphFixture, result: unknown) => string | null;
  run: (fx: GraphFixture) => Effect.Effect<unknown, DomainTag, Db>;
};

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
    channel: "triage_accept",
    caseId: fx.caseId,
    patch: [op],
    confidence: "unverified",
    actor: { actorId: TEST_ACTOR_ID },
  });
}

const NEW_ID = testId(60);

export const GRAPH_MUTATIONS: readonly GraphMutation[] = [
  {
    name: "entity.create",
    kind: "entity",
    action: "created",
    historyRows: 6,
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
    kind: "entity",
    action: "updated",
    subjectId: (fx) => fx.entityId,
    run: (fx) =>
      updateEntityFieldsEffect({
        ...scope(fx),
        entityId: fx.entityId,
        expectedVersion: 1,
        summary: "Mathematician",
      }),
  },
  {
    name: "entity.delete",
    kind: "entity",
    action: "deleted",
    historyRows: 2,
    subjectId: (fx) => fx.otherEntityId,
    run: (fx) =>
      deleteEntityEffect(fx.caseId, fx.organizationId, fx.otherEntityId, ACTOR),
  },
  {
    name: "edge.create",
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
    kind: "edge",
    action: "updated",
    subjectId: (fx) => fx.edgeId,
    run: (fx) =>
      updateEdgeEffect({
        ...scope(fx),
        edgeId: fx.edgeId,
        expectedVersion: 1,
        notes: "updated",
      }),
  },
  {
    name: "edge.delete",
    kind: "edge",
    action: "deleted",
    subjectId: (fx) => fx.edgeId,
    run: (fx) =>
      deleteEdgeEffect(fx.caseId, fx.organizationId, fx.edgeId, ACTOR),
  },
  {
    name: "claim.create",
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
    kind: "claim",
    action: "updated",
    subjectId: (fx) => fx.claimId,
    run: (fx) =>
      updateClaimEffect({
        ...scope(fx),
        claimId: fx.claimId,
        expectedVersion: 1,
        text: "Edited",
      }),
  },
  {
    name: "claim.retract",
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
    kind: "identifier",
    action: "updated",
    subjectId: (fx) => fx.identifierId,
    run: (fx) =>
      updateIdentifierEffect({
        ...scope(fx),
        identifierId: fx.identifierId,
        expectedVersion: 1,
        status: "current",
      }),
  },
  {
    name: "identifier.delete",
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
    kind: "event",
    action: "updated",
    subjectId: (fx) => fx.eventId,
    run: (fx) =>
      updateEventEffect({
        ...scope(fx),
        eventId: fx.eventId,
        expectedVersion: 1,
        what: "Born in London",
      }),
  },
  {
    name: "event.delete",
    kind: "event",
    action: "deleted",
    subjectId: (fx) => fx.eventId,
    run: (fx) =>
      deleteEventEffect(fx.caseId, fx.organizationId, fx.eventId, ACTOR),
  },
  {
    name: "question.create",
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
    kind: "question",
    action: "updated",
    subjectId: (fx) => fx.questionId,
    run: (fx) =>
      updateQuestionEffect({
        ...scope(fx),
        questionId: fx.questionId,
        expectedVersion: 1,
        text: "Where did she live as a child?",
      }),
  },
  {
    name: "question.reopen",
    kind: "question",
    action: "updated",
    subjectId: (fx) => fx.resolvedQuestionId,
    run: (fx) =>
      reopenQuestionEffect({ ...scope(fx), questionId: fx.resolvedQuestionId }),
  },
  {
    name: "question.delete",
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
    historyRows: 0,
    subjectId: (fx) => fx.caseId,
    run: (fx) =>
      updateCaseEffect({
        id: fx.caseId,
        organizationId: fx.organizationId,
        ...ACTOR,
        description: "Updated description",
      }),
  },
  {
    name: "task.create",
    sites: ["tasks/tasks.ts#createTaskEffect"],
    kind: "task",
    action: "created",
    subjectId: (_fx, result) => resultId(result),
    run: (fx) => createTaskEffect({ ...scope(fx), title: "Pull the lease" }),
  },
  {
    name: "task.update",
    sites: ["tasks/tasks.ts#updateTaskEffect"],
    kind: "task",
    action: "updated",
    subjectId: (fx) => fx.taskId,
    run: (fx) =>
      updateTaskEffect({ ...scope(fx), taskId: fx.taskId, title: "Renamed" }),
  },
  {
    name: "task.status",
    sites: ["tasks/tasks.ts#updateTaskEffect"],
    kind: "task",
    action: "status_changed",
    subjectId: (fx) => fx.taskId,
    run: (fx) =>
      updateTaskEffect({
        ...scope(fx),
        taskId: fx.taskId,
        status: "in_progress",
      }),
  },
  {
    name: "task.delete",
    sites: ["tasks/tasks.ts#deleteTaskEffect"],
    kind: "task",
    action: "deleted",
    subjectId: (fx) => fx.taskId,
    run: (fx) =>
      deleteTaskEffect(fx.caseId, fx.organizationId, fx.taskId, TEST_ACTOR_ID),
  },
  {
    name: "task.reorder",
    sites: ["tasks/tasks.ts#reorderTasksEffect"],
    kind: "task",
    action: "reordered",
    historyRows: 2,
    subjectId: () => null,
    run: (fx) =>
      reorderTasksEffect({
        ...scope(fx),
        status: "backlog",
        orderedIds: [fx.otherTaskId, fx.taskId],
      }),
  },
  // The patch path (Accept and the agent graph write): one entry per op, written by the op
  // appliers through the module's joined writer (`runGraphMutationInTx` in `applyPatchEffect`).
  {
    name: "patch.entity.create",
    kind: "entity",
    action: "created",
    historyRows: 6,
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
