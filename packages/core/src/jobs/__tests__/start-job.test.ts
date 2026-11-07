import { describe, expect, it } from "vitest";

import { testCaseId } from "@watchdog/schemas/testing";

import { toJobRecord } from "../start-job";

const ACTOR_ID = "actor-1";

describe("toJobRecord", () => {
  it("normalizes padded evidence ids on wire records", () => {
    const evidenceId = "22222222-2222-4222-8222-000000000002";
    const now = new Date();
    const record = toJobRecord({
      id: "job-1",
      caseId: testCaseId(1),
      capabilityId: "network.dns.lookup",
      input: { host: "example.com" },
      output: null,
      status: "succeeded",
      error: null,
      errorCode: null,
      interpretError: null,
      proposalId: null,
      evidenceIds: [`  ${evidenceId}  `, evidenceId, "  "],
      resultSummary: null,
      fromCache: false,
      suppressedCount: 0,
      actorId: ACTOR_ID,
      actorLabel: null,
      actorKeyId: null,
      logs: [],
      playbookRunId: null,
      playbookStep: null,
      playbookFanIndex: 0,
      retryOfJobId: null,
      pivots: null,
      capVersion: null,
      cacheSourceJobId: null,
      provenanceState: "complete",
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      finishedAt: now,
    });
    expect(record.evidenceIds).toEqual([evidenceId]);
  });
});
