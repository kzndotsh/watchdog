import { describe, expect, it } from "vitest";

import { resolveCollectJobDetailId } from "@/domains/collect/lib/collect-job-detail";
import type { CollectRow } from "@/domains/collect/types";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import { testId } from "@watchdog/test-kit";

function job(overrides: Partial<JobListRecord> = {}): JobListRecord {
  return {
    id: testId(11),
    caseId: testId(10),
    capabilityId: "network.dns.lookup",
    status: "running",
    input: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    error: null,
    interpretError: null,
    proposalId: null,
    resultSummary: null,
    fromCache: false,
    suppressedCount: 0,
    playbookRunId: testId(12),
    playbookId: testId(13),
    playbookRunStatus: "running",
    playbookStep: 1,
    evidenceIds: [],
    output: [],
    actorId: "test-actor",
    playbookFanIndex: 0,
    ...overrides,
  };
}

const jobOnlyRow: CollectRow = {
  id: testId(12),
  title: "Playbook run",
  hint: null,
  state: "running",
  when: "2026-01-01T00:00:00.000Z",
  entityId: null,
  evidence: null,
  runs: [{ job: job({ id: testId(11) }), role: "step" }],
  playbookRunId: testId(12),
  recipe: { step: 1, total: 3 },
};

describe("resolveCollectJobDetailId", () => {
  it("returns null for evidence rows", () => {
    expect(
      resolveCollectJobDetailId(
        {
          ...jobOnlyRow,
          evidence: {
            id: testId(40),
          } as CollectRow["evidence"],
        },
        null
      )
    ).toBeNull();
  });

  it("returns null when no row is selected", () => {
    expect(resolveCollectJobDetailId(null, null)).toBeNull();
  });

  it("prefers focusRunId over the first run job", () => {
    expect(resolveCollectJobDetailId(jobOnlyRow, testId(99))).toBe(testId(99));
  });

  it("falls back to the first run job id", () => {
    expect(resolveCollectJobDetailId(jobOnlyRow, null)).toBe(testId(11));
  });
});
