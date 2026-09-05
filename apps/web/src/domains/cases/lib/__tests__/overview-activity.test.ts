import { describe, expect, it } from "vitest";

import type { EvidenceRecord } from "@/domains/intake/types";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import type { ProposalRecord } from "@watchdog/core";
import { testId } from "@watchdog/test-kit";

import { buildCaseOverviewActivity } from "../overview-activity.ts";

describe("buildCaseOverviewActivity", () => {
  it("sorts newest first and caps the list", () => {
    const evidence: EvidenceRecord = {
      id: testId(40),
      caseId: testId(10),
      entityId: null,
      kind: "attestation",
      label: "old",
      notes: null,
      mime: "text/plain",
      uri: null,
      sha256: null,
      text: null,
      sourceUrl: null,
      actorId: "test-actor",
      actorLabel: "test-actor",
      capturedAt: "2026-01-01T00:00:00.000Z",
      processedAt: null,
      deletedAt: null,
    };
    const job: JobListRecord = {
      id: testId(11),
      caseId: testId(10),
      capabilityId: "network.dns.lookup",
      status: "succeeded",
      input: {},
      createdAt: "2026-01-03T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      error: null,
      interpretError: null,
      proposalId: null,
      resultSummary: "dns",
      fromCache: false,
      suppressedCount: 0,
      playbookRunId: null,
      playbookId: null,
      playbookRunStatus: null,
      playbookStep: null,
      playbookFanIndex: 0,
      evidenceIds: [],
      output: [],
      actorId: "test-actor",
      actorLabel: "test-actor",
    };
    const pending: ProposalRecord = {
      id: testId(50),
      caseId: testId(10),
      jobId: null,
      capabilityId: null,
      status: "pending",
      patch: [],
      summary: "pending",
      suppressedCount: 0,
      evidenceIds: [],
      rejectReason: null,
      decidedBy: null,
      decidedByLabel: null,
      decidedAt: null,
      createdAt: "2026-01-02T00:00:00.000Z",
      agentSourced: false,
      userOverridden: false,
      createdBy: null,
      createdByLabel: null,
    };
    const extra: EvidenceRecord = {
      ...evidence,
      id: testId(41),
      label: "newest",
      capturedAt: "2026-01-04T00:00:00.000Z",
    };
    const items = buildCaseOverviewActivity(
      [evidence, extra],
      [job],
      [pending],
      3
    );
    expect(items.map((row) => row.kind)).toEqual([
      "evidence",
      "job",
      "proposal",
    ]);
    expect(items[0]?.label).toBe("newest");
    expect(items).toHaveLength(3);
  });
});
