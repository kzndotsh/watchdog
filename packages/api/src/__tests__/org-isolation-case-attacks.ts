import { testId } from "@watchdog/test-kit/fixtures";

import type { ApiClient, Attack, IsolationIds } from "./org-isolation-fixtures";

/**
 * The procedures that address a deleted Case on purpose (owners and admins restore, purge and
 * open it by URL). Every other procedure treats a tombstoned Case as missing.
 */
export const TOMBSTONE_AWARE_PROCEDURES: ReadonlySet<string> = new Set([
  "cases.restore",
  "cases.purge",
  "cases.getDeletedBySlug",
]);

/** B addresses A's case directly. */
export function foreignCaseAttacks(b: ApiClient, ids: IsolationIds): Attack[] {
  const caseId = ids.caseA;
  return [
    ["cases.get", async () => b.cases.get({ caseId })],
    [
      "cases.getBySlug",
      async () => b.cases.getBySlug({ caseSlug: ids.caseSlugA }),
    ],
    ["cases.update", async () => b.cases.update({ caseId, name: "Hijack" })],
    ["cases.delete", async () => b.cases.delete({ caseId })],
    ["cases.restore", async () => b.cases.restore({ caseId })],
    ["cases.purge", async () => b.cases.purge({ caseId })],
    ["cases.deletionPolicy", async () => b.cases.deletionPolicy({ caseId })],
    [
      "cases.getDeletedBySlug",
      async () => b.cases.getDeletedBySlug({ caseSlug: ids.caseSlugA }),
    ],
    ["entities.list", async () => b.entities.list({ caseId })],
    [
      "entities.getMany",
      async () => b.entities.getMany({ caseId, ids: [ids.entityA] }),
    ],
    ["entities.get", async () => b.entities.get({ caseId, slug: "alice-a" })],
    [
      "entities.create",
      async () =>
        b.entities.create({ caseId, kind: "person", name: "Mallory" }),
    ],
    [
      "entities.update",
      async () =>
        b.entities.update({
          expectedVersion: 1,
          caseId,
          entityId: ids.entityA,
          name: "Hijack",
        }),
    ],
    [
      "entities.delete",
      async () => b.entities.delete({ caseId, entityId: ids.entityA }),
    ],
    [
      "entities.recordAiHandoff",
      async () =>
        b.entities.recordAiHandoff({
          caseId,
          slug: "alice-a",
          destination: "claude",
        }),
    ],
    [
      "history.list",
      async () =>
        b.history.list({
          caseId,
          kind: "entity",
          rowId: ids.entityA,
          limit: 25,
        }),
    ],
    [
      "claims.list",
      async () => b.claims.list({ caseId, entityId: ids.entityA }),
    ],
    [
      "claims.create",
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
      "claims.update",
      async () =>
        b.claims.update({
          expectedVersion: 1,
          caseId,
          claimId: ids.claimA,
          text: "planted",
        }),
    ],
    [
      "claims.retract",
      async () =>
        b.claims.retract({
          caseId,
          claimId: ids.claimA,
          kind: "disproved",
          reason: "x",
        }),
    ],
    [
      "identifiers.list",
      async () => b.identifiers.list({ caseId, entityId: ids.entityA }),
    ],
    [
      "identifiers.getMany",
      async () => b.identifiers.getMany({ caseId, ids: [ids.identifierA] }),
    ],
    [
      "identifiers.create",
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
      "identifiers.update",
      async () =>
        b.identifiers.update({
          expectedVersion: 1,
          caseId,
          identifierId: ids.identifierA,
          notes: "planted",
        }),
    ],
    [
      "identifiers.delete",
      async () =>
        b.identifiers.delete({ caseId, identifierId: ids.identifierA }),
    ],
    ["edges.list", async () => b.edges.list({ caseId, entityId: ids.entityA })],
    ["edges.listForCase", async () => b.edges.listForCase({ caseId })],
    [
      "edges.create",
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
      "edges.update",
      async () =>
        b.edges.update({
          expectedVersion: 1,
          caseId,
          edgeId: ids.edgeA,
          notes: "x",
        }),
    ],
    ["edges.delete", async () => b.edges.delete({ caseId, edgeId: ids.edgeA })],
    [
      "events.list",
      async () => b.events.list({ caseId, entityId: ids.entityA }),
    ],
    [
      "events.create",
      async () =>
        b.events.create({
          caseId,
          entityId: ids.entityA,
          when: "2026-02-02",
          what: "planted",
        }),
    ],
    [
      "events.update",
      async () =>
        b.events.update({
          expectedVersion: 1,
          caseId,
          eventId: ids.eventA,
          what: "planted",
        }),
    ],
    [
      "events.delete",
      async () => b.events.delete({ caseId, eventId: ids.eventA }),
    ],
    [
      "questions.list",
      async () => b.questions.list({ caseId, entityId: ids.entityA }),
    ],
    [
      "questions.create",
      async () =>
        b.questions.create({
          caseId,
          entityId: ids.entityA,
          text: "planted",
        }),
    ],
    [
      "questions.update",
      async () =>
        b.questions.update({
          expectedVersion: 1,
          caseId,
          questionId: ids.questionA,
          text: "x",
        }),
    ],
    [
      "questions.resolve",
      async () =>
        b.questions.resolve({
          caseId,
          questionId: ids.questionA,
          resolvedNote: "x",
        }),
    ],
    [
      "questions.reopen",
      async () => b.questions.reopen({ caseId, questionId: ids.questionA }),
    ],
    [
      "questions.delete",
      async () => b.questions.delete({ caseId, questionId: ids.questionA }),
    ],
    ["tasks.list", async () => b.tasks.list({ caseId })],
    ["tasks.get", async () => b.tasks.get({ caseId, taskId: ids.taskA })],
    ["tasks.create", async () => b.tasks.create({ caseId, title: "planted" })],
    [
      "tasks.update",
      async () => b.tasks.update({ caseId, taskId: ids.taskA, title: "x" }),
    ],
    ["tasks.remove", async () => b.tasks.remove({ caseId, taskId: ids.taskA })],
    [
      "tasks.reorder",
      async () =>
        b.tasks.reorder({
          caseId,
          status: "backlog",
          orderedIds: [ids.taskA],
        }),
    ],
    ["evidence.list", async () => b.evidence.list({ caseId })],
    [
      "evidence.get",
      async () => b.evidence.get({ caseId, evidenceId: ids.evidenceA }),
    ],
    [
      "evidence.getMany",
      async () => b.evidence.getMany({ caseId, ids: [ids.evidenceA] }),
    ],
    [
      "evidence.listProviderCalls",
      async () =>
        b.evidence.listProviderCalls({ caseId, evidenceId: ids.evidenceA }),
    ],
    [
      "evidence.createPaste",
      async () => b.evidence.createPaste({ caseId, body: "planted" }),
    ],
    [
      "evidence.createUrl",
      async () =>
        b.evidence.createUrl({ caseId, sourceUrl: "https://example.com/x" }),
    ],
    [
      "evidence.softDelete",
      async () => b.evidence.softDelete({ caseId, evidenceId: ids.evidenceA }),
    ],
    [
      "evidence.restore",
      async () => b.evidence.restore({ caseId, evidenceId: ids.evidenceA }),
    ],
    [
      "evidence.attachEntity",
      async () =>
        b.evidence.attachEntity({
          caseId,
          evidenceId: ids.evidenceA,
          entityId: ids.entityA,
        }),
    ],
    [
      "evidence.presign",
      async () =>
        b.evidence.presign({
          caseId,
          sha256: "a".repeat(64),
          mime: "text/plain",
          byteLength: 10,
        }),
    ],
    [
      "evidence.confirmFile",
      async () =>
        b.evidence.confirmFile({
          caseId,
          uri: `${caseId}/${"a".repeat(64)}/file.txt`,
          sha256: "a".repeat(64),
          mime: "text/plain",
          byteLength: 10,
        }),
    ],
    [
      "evidence.downloadUrl",
      async () => b.evidence.downloadUrl({ caseId, evidenceId: ids.evidenceA }),
    ],
    [
      "evidence.process",
      async () => b.evidence.process({ caseId, evidenceId: ids.evidenceA }),
    ],
    [
      "evidence.enrich",
      async () => b.evidence.enrich({ caseId, evidenceId: ids.evidenceA }),
    ],
    ["jobs.listForCase", async () => b.jobs.listForCase({ caseId })],
    ["jobs.get", async () => b.jobs.get({ caseId, jobId: ids.jobA })],
    [
      "jobs.listProviderCalls",
      async () => b.jobs.listProviderCalls({ caseId, jobId: ids.jobA }),
    ],
    [
      "jobs.start",
      async () =>
        b.jobs.start({
          caseId,
          capabilityId: "network.dns.lookup",
          input: { host: "example.com" },
        }),
    ],
    ["jobs.cancel", async () => b.jobs.cancel({ caseId, jobId: ids.jobA })],
    ["jobs.retry", async () => b.jobs.retry({ caseId, jobId: ids.jobA })],
    [
      "jobs.startPlaybook",
      async () =>
        b.jobs.startPlaybook({
          caseId,
          playbookId: "domain.recon",
          seed: { host: "example.com" },
        }),
    ],
    [
      "jobs.getPlaybookRun",
      async () =>
        b.jobs.getPlaybookRun({ caseId, playbookRunId: ids.playbookRunA }),
    ],
    [
      "jobs.cancelPlaybook",
      async () =>
        b.jobs.cancelPlaybook({ caseId, playbookRunId: ids.playbookRunA }),
    ],
    ["proposals.listForCase", async () => b.proposals.listForCase({ caseId })],
    [
      "proposals.create",
      async () =>
        b.proposals.create({
          caseId,
          patch: [
            {
              op: "create",
              resource: "question",
              id: testId(400),
              data: { entityId: ids.entityA, text: "planted" },
            },
          ],
        }),
    ],
    [
      "proposals.accept",
      async () => b.proposals.accept({ caseId, proposalId: ids.proposalA }),
    ],
    [
      "proposals.reject",
      async () => b.proposals.reject({ caseId, proposalId: ids.proposalA }),
    ],
    ["graph.listWrites", async () => b.graph.listWrites({ caseId })],
    [
      "graph.write",
      async () =>
        b.graph.write({
          caseId,
          userOverride: true,
          patch: [
            {
              op: "create",
              resource: "question",
              id: testId(401),
              data: { entityId: ids.entityA, text: "planted" },
            },
          ],
        }),
    ],
    ["search.case", async () => b.search.case({ caseId, q: "Alice" })],
    ["activity.listRecent", async () => b.activity.listRecent({ caseId })],
  ];
}
