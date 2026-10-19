import { ORPCError } from "@orpc/server";

import { testId } from "@watchdog/test-kit/fixtures";

import type { ApiClient, Attack, IsolationIds } from "./org-isolation-fixtures";

/** B uses its own case but supplies A's child ids. */
export function foreignChildAttacks(b: ApiClient, ids: IsolationIds): Attack[] {
  const caseId = ids.caseB;
  const ownEntity = ids.entityB;
  return [
    [
      "entities.update(A entity)",
      async () =>
        b.entities.update({
          expectedVersion: 1,
          caseId,
          entityId: ids.entityA,
          name: "Hijack",
        }),
    ],
    [
      "entities.delete(A entity)",
      async () => b.entities.delete({ caseId, entityId: ids.entityA }),
    ],
    [
      "history.list(A entity)",
      async () =>
        b.history.list({
          caseId,
          kind: "entity",
          rowId: ids.entityA,
          limit: 25,
        }),
    ],
    [
      "history.list(A entity, cursor)",
      async () =>
        b.history.list({
          caseId,
          kind: "entity",
          rowId: ids.entityA,
          cursor: "1",
          limit: 25,
        }),
    ],
    [
      "history.list(A claim)",
      async () =>
        b.history.list({
          caseId,
          kind: "claim",
          rowId: ids.claimA,
          limit: 25,
        }),
    ],
    [
      "claims.list(A entity)",
      async () => b.claims.list({ caseId, entityId: ids.entityA }),
    ],
    [
      "claims.create(A entity)",
      async () =>
        b.claims.create({
          caseId,
          entityId: ids.entityA,
          text: "planted",
          confidence: "unverified",
          class: "observation",
        }),
    ],
    [
      "claims.update(A claim)",
      async () =>
        b.claims.update({
          expectedVersion: 1,
          caseId,
          claimId: ids.claimA,
          text: "planted",
        }),
    ],
    [
      "claims.retract(A claim)",
      async () =>
        b.claims.retract({
          caseId,
          claimId: ids.claimA,
          kind: "disproved",
          reason: "x",
        }),
    ],
    [
      "identifiers.list(A entity)",
      async () => b.identifiers.list({ caseId, entityId: ids.entityA }),
    ],
    [
      "identifiers.create(A entity)",
      async () =>
        b.identifiers.create({
          caseId,
          entityId: ids.entityA,
          type: "email",
          value: "mallory@example.com",
          confidence: "unverified",
        }),
    ],
    [
      "identifiers.update(A identifier)",
      async () =>
        b.identifiers.update({
          expectedVersion: 1,
          caseId,
          identifierId: ids.identifierA,
          notes: "planted",
        }),
    ],
    [
      "identifiers.delete(A identifier)",
      async () =>
        b.identifiers.delete({ caseId, identifierId: ids.identifierA }),
    ],
    [
      "edges.list(A entity)",
      async () => b.edges.list({ caseId, entityId: ids.entityA }),
    ],
    [
      "edges.create(A endpoints)",
      async () =>
        b.edges.create({
          caseId,
          fromId: ids.entityA,
          toId: ids.entityA2,
          predicate: "owns",
          confidence: "unverified",
        }),
    ],
    [
      "edges.create(own -> A entity)",
      async () =>
        b.edges.create({
          caseId,
          fromId: ownEntity,
          toId: ids.entityA,
          predicate: "owns",
          confidence: "unverified",
        }),
    ],
    [
      "edges.update(A edge)",
      async () =>
        b.edges.update({
          expectedVersion: 1,
          caseId,
          edgeId: ids.edgeA,
          notes: "x",
        }),
    ],
    [
      "edges.delete(A edge)",
      async () => b.edges.delete({ caseId, edgeId: ids.edgeA }),
    ],
    [
      "events.list(A entity)",
      async () => b.events.list({ caseId, entityId: ids.entityA }),
    ],
    [
      "events.create(A entity)",
      async () =>
        b.events.create({
          caseId,
          entityId: ids.entityA,
          when: "2026-02-02",
          what: "planted",
        }),
    ],
    [
      "events.update(A event)",
      async () =>
        b.events.update({
          expectedVersion: 1,
          caseId,
          eventId: ids.eventA,
          what: "planted",
        }),
    ],
    [
      "events.delete(A event)",
      async () => b.events.delete({ caseId, eventId: ids.eventA }),
    ],
    [
      "questions.list(A entity)",
      async () => b.questions.list({ caseId, entityId: ids.entityA }),
    ],
    [
      "questions.create(A entity)",
      async () =>
        b.questions.create({
          caseId,
          entityId: ids.entityA,
          text: "planted",
        }),
    ],
    [
      "questions.update(A question)",
      async () =>
        b.questions.update({
          expectedVersion: 1,
          caseId,
          questionId: ids.questionA,
          text: "x",
        }),
    ],
    [
      "questions.resolve(A question)",
      async () =>
        b.questions.resolve({
          caseId,
          questionId: ids.questionA,
          resolvedNote: "x",
        }),
    ],
    [
      "questions.reopen(A question)",
      async () => b.questions.reopen({ caseId, questionId: ids.questionA }),
    ],
    [
      "questions.delete(A question)",
      async () => b.questions.delete({ caseId, questionId: ids.questionA }),
    ],
    [
      "tasks.get(A task)",
      async () => b.tasks.get({ caseId, taskId: ids.taskA }),
    ],
    [
      "tasks.update(A task)",
      async () => b.tasks.update({ caseId, taskId: ids.taskA, title: "x" }),
    ],
    [
      "tasks.remove(A task)",
      async () => b.tasks.remove({ caseId, taskId: ids.taskA }),
    ],
    [
      "tasks.create(A entity)",
      async () =>
        b.tasks.create({ caseId, title: "planted", entityId: ids.entityA }),
    ],
    [
      "tasks.reorder(A task)",
      async () =>
        b.tasks.reorder({
          caseId,
          status: "backlog",
          orderedIds: [ids.taskA],
        }),
    ],
    [
      "evidence.createPaste(A entity)",
      async () =>
        b.evidence.createPaste({
          caseId,
          body: "planted",
          entityId: ids.entityA,
        }),
    ],
    [
      "evidence.softDelete(A evidence)",
      async () => b.evidence.softDelete({ caseId, evidenceId: ids.evidenceA }),
    ],
    [
      "evidence.restore(A evidence)",
      async () => b.evidence.restore({ caseId, evidenceId: ids.evidenceA }),
    ],
    [
      "evidence.attachEntity(A evidence)",
      async () =>
        b.evidence.attachEntity({
          caseId,
          evidenceId: ids.evidenceA,
          entityId: ownEntity,
        }),
    ],
    [
      "evidence.downloadUrl(A evidence)",
      async () => {
        const { url } = await b.evidence.downloadUrl({
          caseId,
          evidenceId: ids.evidenceA,
        });
        // Lookup is scoped to B's case, so A's row is invisible: no URL may come back.
        throw new ORPCError(url === null ? "NOT_FOUND" : "LEAKED_URL");
      },
    ],
    [
      "evidence.process(A evidence)",
      async () => b.evidence.process({ caseId, evidenceId: ids.evidenceA }),
    ],
    [
      "evidence.enrich(A evidence)",
      async () => b.evidence.enrich({ caseId, evidenceId: ids.evidenceA }),
    ],
    ["jobs.get(A job)", async () => b.jobs.get({ caseId, jobId: ids.jobA })],
    [
      "jobs.cancel(A job)",
      async () => b.jobs.cancel({ caseId, jobId: ids.jobA }),
    ],
    [
      "jobs.retry(A job)",
      async () => b.jobs.retry({ caseId, jobId: ids.jobA }),
    ],
    [
      "jobs.cancelPlaybook(A run)",
      async () =>
        b.jobs.cancelPlaybook({ caseId, playbookRunId: ids.playbookRunA }),
    ],
    [
      "proposals.accept(A proposal)",
      async () => b.proposals.accept({ caseId, proposalId: ids.proposalA }),
    ],
    [
      "proposals.reject(A proposal)",
      async () => b.proposals.reject({ caseId, proposalId: ids.proposalA }),
    ],
    [
      "proposals.create+accept(patch references A entity)",
      async () => {
        const proposal = await b.proposals.create({
          caseId,
          patch: [
            {
              op: "create",
              resource: "question",
              id: testId(402),
              data: { entityId: ids.entityA, text: "planted" },
            },
          ],
        });
        return b.proposals.accept({ caseId, proposalId: proposal.id });
      },
    ],
    [
      "graph.write(update A entity)",
      async () =>
        b.graph.write({
          caseId,
          userOverride: true,
          patch: [
            {
              op: "update",
              resource: "entity",
              id: ids.entityA,
              data: { name: "Hijack" },
            },
          ],
        }),
    ],
    [
      "graph.write(upsert A entity id)",
      async () =>
        b.graph.write({
          caseId,
          userOverride: true,
          patch: [
            {
              op: "upsert",
              resource: "entity",
              id: ids.entityA,
              data: { kind: "person", name: "Hijack", slug: "hijack" },
            },
          ],
        }),
    ],
    [
      "graph.write(claim on A entity)",
      async () =>
        b.graph.write({
          caseId,
          userOverride: true,
          patch: [
            {
              op: "create",
              resource: "claim",
              id: testId(403),
              data: { entityId: ids.entityA, text: "planted" },
            },
          ],
        }),
    ],
  ];
}
