import { describe, expect, it } from "vitest";

import {
  resolveCollectJobDetailId,
  resolveCollectRecipeTotal,
} from "@/domains/collect/lib/collect-job-detail";
import type { CollectRow } from "@/domains/collect/types";
import type { JobListRecord } from "@/domains/jobs/types";
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
    actorLabel: "test-actor",
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

  it("falls back to the first open step, not the newest finished step", () => {
    const step1 = job({
      id: testId(11),
      status: "running",
      playbookStep: 1,
      createdAt: "2026-01-01T00:01:00.000Z",
    });
    const step2 = job({
      id: testId(12),
      status: "succeeded",
      playbookStep: 2,
      createdAt: "2026-01-01T00:02:00.000Z",
    });
    const row: CollectRow = {
      ...jobOnlyRow,
      runs: [
        { job: step2, role: "step" },
        { job: step1, role: "step" },
      ],
    };

    expect(resolveCollectJobDetailId(row, null)).toBe(testId(11));
  });

  it("prefers a blocked step over a queued step when choosing detail", () => {
    const queued = job({
      id: testId(21),
      status: "queued",
      playbookStep: 2,
    });
    const blocked = job({
      id: testId(22),
      status: "blocked",
      playbookStep: 1,
    });
    const row: CollectRow = {
      ...jobOnlyRow,
      runs: [
        { job: queued, role: "step" },
        { job: blocked, role: "step" },
      ],
    };

    expect(resolveCollectJobDetailId(row, null)).toBe(testId(22));
  });

  it("falls back to the first run job id when no step is open", () => {
    expect(resolveCollectJobDetailId(jobOnlyRow, null)).toBe(testId(11));
  });
});

describe("resolveCollectRecipeTotal", () => {
  it("returns recipe total from playbook rows", () => {
    expect(
      resolveCollectRecipeTotal(jobOnlyRow, new Map([["domain-sweep", 9]]))
    ).toBe(3);
  });

  it("returns null for evidence rows", () => {
    expect(
      resolveCollectRecipeTotal(
        {
          ...jobOnlyRow,
          evidence: { id: testId(40) } as CollectRow["evidence"],
        },
        new Map()
      )
    ).toBeUndefined();
  });

  it("looks up catalog steps for orphan jobs without recipe metadata", () => {
    const row: CollectRow = {
      ...jobOnlyRow,
      recipe: null,
      runs: [
        {
          job: job({ playbookId: null, playbookStep: 1 }),
          role: "step",
        },
        {
          job: job({
            id: testId(14),
            playbookId: "domain-sweep",
            playbookStep: 2,
          }),
          role: "step",
        },
      ],
    };
    expect(resolveCollectRecipeTotal(row, new Map([["domain-sweep", 5]]))).toBe(
      5
    );
  });
});
