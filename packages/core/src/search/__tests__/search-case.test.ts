import { describe, it, expect } from "vitest";

import type { JobListRow, JobWithPlaybook } from "@watchdog/db";
import { testId } from "@watchdog/test-kit";

import { runDomain } from "../../infra/run-domain.ts";
import { collapseSearchJobHits, searchCaseEffect } from "../search-case.ts";

function jobRow(
  overrides: Partial<JobListRow> & Pick<JobListRow, "id">
): JobWithPlaybook<JobListRow> {
  const now = new Date("2026-01-03T00:00:00.000Z");
  return {
    job: {
      caseId: testId(10),
      capabilityId: "network.dns.lookup",
      input: { host: "example.com" },
      output: null,
      status: "running",
      error: null,
      interpretError: null,
      proposalId: null,
      evidenceIds: [],
      resultSummary: null,
      fromCache: false,
      suppressedCount: 0,
      actorId: "actor",
      actorLabel: "actor",
      playbookRunId: null,
      playbookStep: null,
      playbookFanIndex: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
      ...overrides,
    },
    playbookId: null,
    playbookRunStatus: null,
  };
}

describe("collapseSearchJobHits", () => {
  it("keeps solo jobs and collapses playbook steps into one hit per run", () => {
    const runId = testId(14);
    const hits = collapseSearchJobHits([
      jobRow({ id: testId(11) }),
      {
        ...jobRow({
          id: testId(20),
          playbookRunId: runId,
          playbookStep: 0,
          status: "succeeded",
          resultSummary: "dns ok",
          updatedAt: new Date("2026-01-03T00:01:00.000Z"),
        }),
        playbookId: "host-footprint-lite",
      },
      {
        ...jobRow({
          id: testId(21),
          playbookRunId: runId,
          playbookStep: 1,
          status: "running",
          updatedAt: new Date("2026-01-03T00:02:00.000Z"),
        }),
        playbookId: "host-footprint-lite",
      },
    ]);

    expect(hits).toHaveLength(2);
    const collapsed = hits.find((hit) => hit.id === runId);
    expect(collapsed?.status).toBe("running");
    expect(collapsed?.resultSummary).toBe("dns ok");
    expect(collapsed?.playbookId).toBe("host-footprint-lite");
  });

  it("prefers blocked over queued when a later step is only queued", () => {
    const runId = testId(15);
    const hits = collapseSearchJobHits([
      {
        ...jobRow({
          id: testId(30),
          playbookRunId: runId,
          playbookStep: 0,
          status: "blocked",
          updatedAt: new Date("2026-01-03T00:01:00.000Z"),
        }),
        playbookId: "host-footprint-lite",
      },
      {
        ...jobRow({
          id: testId(31),
          playbookRunId: runId,
          playbookStep: 1,
          status: "queued",
          updatedAt: new Date("2026-01-03T00:02:00.000Z"),
        }),
        playbookId: "host-footprint-lite",
      },
    ]);

    expect(hits).toHaveLength(1);
    expect(hits[0]?.status).toBe("blocked");
  });

  it("groups playbook steps when run id is padded with whitespace", () => {
    const runId = testId(16);
    const hits = collapseSearchJobHits([
      {
        ...jobRow({
          id: testId(40),
          playbookRunId: `  ${runId}  `,
          playbookStep: 0,
          status: "succeeded",
          resultSummary: "dns ok",
          updatedAt: new Date("2026-01-03T00:01:00.000Z"),
        }),
        playbookId: "host-footprint-lite",
      },
      {
        ...jobRow({
          id: testId(41),
          playbookRunId: runId,
          playbookStep: 1,
          status: "queued",
          updatedAt: new Date("2026-01-03T00:02:00.000Z"),
        }),
        playbookId: "host-footprint-lite",
      },
    ]);

    expect(hits).toHaveLength(1);
    expect(hits[0]?.id).toBe(runId);
    expect(hits[0]?.status).toBe("queued");
  });
});

describe("searchCase", () => {
  it("returns empty buckets when query is shorter than 2 chars (no DB)", async () => {
    const result = await runDomain(
      searchCaseEffect({
        caseId: "00000000-0000-4000-8000-000000000000",
        organizationId: "org-test",
        q: "a",
      })
    );
    expect(result.q).toBe("a");
    expect(result.entities).toEqual([]);
    expect(result.identifiers).toEqual([]);
    expect(result.evidence).toEqual([]);
    expect(result.tasks).toEqual([]);
    expect(result.jobs).toEqual([]);
    expect(result.proposals).toEqual([]);
    expect(result.cases).toEqual([]);
  });

  it("trims whitespace-only short queries", async () => {
    const result = await runDomain(
      searchCaseEffect({
        caseId: "00000000-0000-4000-8000-000000000000",
        organizationId: "org-test",
        q: "  ",
      })
    );
    expect(result.q).toBe("");
    expect(result.entities.length).toBe(0);
  });
});
