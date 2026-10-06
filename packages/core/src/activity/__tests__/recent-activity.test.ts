import { describe, expect, it } from "vitest";

import type { JobActivityLabelRow } from "@watchdog/db";
import {
  ACTIVITY_ENTRY_KINDS,
  isActivityActionForKind,
} from "@watchdog/schemas/feed";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

import { jobLabelSubject } from "../job-feed";
import {
  clampActivityLimit,
  FEED_ACTIONS,
  proposalEventAction,
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

  it("breaks an updatedAt tie by Job id, whatever the row order", () => {
    const runId = testId(17);
    const at = new Date("2026-01-03T00:01:00.000Z");
    const rows = [
      labelRow({
        id: testId(60),
        playbookRunId: runId,
        playbookStep: 0,
        resultSummary: "low id",
        updatedAt: at,
      }),
      labelRow({
        id: testId(61),
        playbookRunId: runId,
        playbookStep: 1,
        resultSummary: "high id",
        updatedAt: at,
      }),
    ];
    const entry = { subjectId: testId(60), groupId: runId };
    expect(jobLabelSubject(entry, rows)?.resultSummary).toBe("high id");
    const [low, high] = rows;
    if (low === undefined || high === undefined) throw new TypeError("rows");
    expect(jobLabelSubject(entry, [high, low])?.resultSummary).toBe("high id");
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

describe("clampActivityLimit", () => {
  it("clamps to [1, 100] and falls back for non-finite values", () => {
    expect(clampActivityLimit(undefined)).toBe(15);
    expect(clampActivityLimit(0)).toBe(1);
    expect(clampActivityLimit(200)).toBe(100);
    expect(clampActivityLimit(Number.NaN)).toBe(15);
  });
});

describe("proposalEventAction", () => {
  it("names the entry verbs and falls back to proposed", () => {
    expect(proposalEventAction("created")).toBe("Proposed");
    expect(proposalEventAction("accepted")).toBe("Accepted");
    expect(proposalEventAction("rejected")).toBe("Rejected");
  });
});

describe("FEED_ACTIONS", () => {
  it("only lists verbs the log allows for the kind", () => {
    for (const [kind, actions] of Object.entries(FEED_ACTIONS)) {
      for (const action of actions) {
        expect(
          isActivityActionForKind(
            ACTIVITY_ENTRY_KINDS.find((k) => k === kind) ?? "task",
            action
          )
        ).toBe(true);
      }
    }
  });

  it("keeps Graph, Case and the non-feed Evidence and Task verbs out", () => {
    expect(Object.keys(FEED_ACTIONS).sort()).toEqual([
      "evidence",
      "job",
      "proposal",
      "task",
    ]);
    expect(FEED_ACTIONS.evidence).toEqual(["captured"]);
    expect(FEED_ACTIONS.task).not.toContain("updated");
    expect(FEED_ACTIONS.task).not.toContain("reordered");
  });
});
