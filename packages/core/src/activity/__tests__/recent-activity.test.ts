import { describe, expect, it } from "vitest";

import type { JobActivityLabelRow } from "@watchdog/db";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

import { jobLabelSubject } from "../job-feed";
import {
  clampActivityLimit,
  mergeActivityItems,
  perSourceFetchLimit,
} from "../recent-activity";

function labelRow(
  overrides: Partial<JobActivityLabelRow> & Pick<JobActivityLabelRow, "id">
): JobActivityLabelRow {
  return {
    caseId: testCaseId(10),
    capabilityId: "network.dns.lookup",
    resultSummary: null,
    input: { host: "example.com" },
    playbookRunId: null,
    playbookStep: null,
    playbookFanIndex: 0,
    playbookId: null,
    updatedAt: new Date("2026-01-03T00:00:00.000Z"),
    ...overrides,
  };
}

describe("jobLabelSubject", () => {
  it("labels a solo entry from its own Job", () => {
    const job = labelRow({ id: testId(11), resultSummary: "dns ok" });
    const subject = jobLabelSubject({ subjectId: job.id, groupId: null }, [
      labelRow({ id: testId(12), capabilityId: "network.whois.lookup" }),
      job,
    ]);
    expect(subject).toMatchObject({
      capabilityId: "network.dns.lookup",
      resultSummary: "dns ok",
      playbookId: null,
    });
  });

  it("labels a group from the run's seed step, playbook and newest summary", () => {
    const runId = testId(14);
    const rows = [
      labelRow({
        id: testId(21),
        playbookRunId: runId,
        playbookStep: 1,
        capabilityId: "network.whois.lookup",
        playbookId: "host-footprint-lite",
        resultSummary: "whois ok",
        updatedAt: new Date("2026-01-03T00:02:00.000Z"),
      }),
      labelRow({
        id: testId(20),
        playbookRunId: runId,
        playbookStep: 0,
        playbookId: "host-footprint-lite",
        resultSummary: "dns ok",
        updatedAt: new Date("2026-01-03T00:01:00.000Z"),
      }),
    ];
    const subject = jobLabelSubject(
      { subjectId: testId(21), groupId: runId },
      rows
    );
    expect(subject).toMatchObject({
      capabilityId: "network.dns.lookup",
      playbookId: "host-footprint-lite",
      resultSummary: "whois ok",
    });
  });

  it("skips blank summaries when picking the newest one", () => {
    const runId = testId(15);
    const subject = jobLabelSubject({ subjectId: testId(30), groupId: runId }, [
      labelRow({
        id: testId(30),
        playbookRunId: runId,
        playbookStep: 0,
        resultSummary: "dns ok",
        updatedAt: new Date("2026-01-03T00:01:00.000Z"),
      }),
      labelRow({
        id: testId(31),
        playbookRunId: runId,
        playbookStep: 1,
        resultSummary: "   ",
        updatedAt: new Date("2026-01-03T00:02:00.000Z"),
      }),
    ]);
    expect(subject?.resultSummary).toBe("dns ok");
  });

  it("matches a group when its id is padded with whitespace", () => {
    const runId = testId(16);
    const subject = jobLabelSubject(
      { subjectId: testId(40), groupId: `  ${runId}  ` },
      [labelRow({ id: testId(40), playbookRunId: runId, playbookStep: 0 })]
    );
    expect(subject).toBeDefined();
  });

  it("returns undefined when the Job is gone", () => {
    expect(
      jobLabelSubject({ subjectId: testId(50), groupId: null }, [])
    ).toBeUndefined();
    expect(
      jobLabelSubject({ subjectId: testId(50), groupId: testId(51) }, [])
    ).toBeUndefined();
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
          caseId: testCaseId(10),
          caseName: "Case",
          label: "Job",
          at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: testId(2),
          kind: "evidence",
          action: "Captured",
          caseId: testCaseId(10),
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
