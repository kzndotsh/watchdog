import { describe, expect, it } from "vitest";

import type { RecentJobActivityRow } from "@watchdog/db";
import { testId } from "@watchdog/test-kit";

import {
  clampActivityLimit,
  collapseRecentJobActivityRows,
  mergeActivityItems,
  perSourceFetchLimit,
} from "../recent-activity";

function jobRow(
  overrides: Partial<RecentJobActivityRow> & Pick<RecentJobActivityRow, "id">
): RecentJobActivityRow {
  return {
    caseId: testId(10),
    caseName: "Case",
    capabilityId: "network.dns.lookup",
    status: "running",
    resultSummary: null,
    input: { host: "example.com" },
    playbookRunId: null,
    playbookStep: null,
    playbookId: null,
    actorId: "actor",
    actorLabel: "actor",
    at: new Date("2026-01-03T00:00:00.000Z"),
    ...overrides,
  };
}

describe("collapseRecentJobActivityRows", () => {
  it("keeps solo jobs and collapses playbook steps into one row per run", () => {
    const runId = testId(14);
    const rows = collapseRecentJobActivityRows([
      jobRow({ id: testId(11) }),
      jobRow({
        id: testId(20),
        playbookRunId: runId,
        playbookStep: 0,
        playbookId: "host-footprint-lite",
        status: "succeeded",
        resultSummary: "dns ok",
        at: new Date("2026-01-03T00:01:00.000Z"),
      }),
      jobRow({
        id: testId(21),
        playbookRunId: runId,
        playbookStep: 1,
        playbookId: "host-footprint-lite",
        status: "running",
        at: new Date("2026-01-03T00:02:00.000Z"),
      }),
    ]);

    expect(rows).toHaveLength(2);
    const collapsed = rows.find((row) => row.id === runId);
    expect(collapsed?.status).toBe("running");
    expect(collapsed?.resultSummary).toBe("dns ok");
    expect(collapsed?.playbookId).toBe("host-footprint-lite");
  });

  it("prefers blocked over queued when a later step is only queued", () => {
    const runId = testId(15);
    const rows = collapseRecentJobActivityRows([
      jobRow({
        id: testId(30),
        playbookRunId: runId,
        playbookStep: 0,
        playbookId: "host-footprint-lite",
        status: "blocked",
        at: new Date("2026-01-03T00:01:00.000Z"),
      }),
      jobRow({
        id: testId(31),
        playbookRunId: runId,
        playbookStep: 1,
        playbookId: "host-footprint-lite",
        status: "queued",
        at: new Date("2026-01-03T00:02:00.000Z"),
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("blocked");
  });

  it("groups playbook steps when run id is padded with whitespace", () => {
    const runId = testId(16);
    const rows = collapseRecentJobActivityRows([
      jobRow({
        id: testId(40),
        playbookRunId: `  ${runId}  `,
        playbookStep: 0,
        playbookId: "host-footprint-lite",
        status: "succeeded",
        at: new Date("2026-01-03T00:01:00.000Z"),
      }),
      jobRow({
        id: testId(41),
        playbookRunId: runId,
        playbookStep: 1,
        playbookId: "host-footprint-lite",
        status: "running",
        at: new Date("2026-01-03T00:02:00.000Z"),
      }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(runId);
    expect(rows[0]?.status).toBe("running");
  });

  it("treats invalid playbook run ids as solo jobs", () => {
    const rows = collapseRecentJobActivityRows([
      jobRow({
        id: testId(50),
        playbookRunId: "run-1",
        playbookStep: 0,
        status: "succeeded",
      }),
      jobRow({
        id: testId(51),
        playbookRunId: testId(52),
        playbookStep: 0,
        status: "running",
      }),
      jobRow({
        id: testId(53),
        playbookRunId: testId(52),
        playbookStep: 1,
        status: "queued",
      }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.id === testId(50))).toBe(true);
    expect(rows.some((row) => row.id === testId(52))).toBe(true);
  });
});

describe("mergeActivityItems", () => {
  it("sorts newest first and caps the list", () => {
    const merged = mergeActivityItems(
      [
        {
          id: testId(1),
          kind: "job",
          action: "Running",
          caseId: testId(10),
          caseName: "Case",
          label: "Job",
          at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: testId(2),
          kind: "evidence",
          action: "Captured",
          caseId: testId(10),
          caseName: "Case",
          label: "Evidence",
          at: "2026-01-03T00:00:00.000Z",
        },
      ],
      1
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.kind).toBe("evidence");
  });
});

describe("clampActivityLimit", () => {
  it("clamps to [1, 100] and falls back for non-finite values", () => {
    expect(clampActivityLimit(undefined)).toBe(15);
    expect(clampActivityLimit(0)).toBe(1);
    expect(clampActivityLimit(200)).toBe(100);
    expect(clampActivityLimit(Number.NaN)).toBe(15);
  });
});

describe("perSourceFetchLimit", () => {
  it("over-fetches per source before merge without unbounded growth", () => {
    expect(perSourceFetchLimit(15)).toBe(60);
    expect(perSourceFetchLimit(30)).toBe(100);
    expect(perSourceFetchLimit(5)).toBe(20);
  });
});
