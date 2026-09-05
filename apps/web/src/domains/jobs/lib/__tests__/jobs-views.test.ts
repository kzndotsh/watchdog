import { describe, expect, it } from "vitest";

import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import { testId } from "@watchdog/test-kit";

import { artifactDefaultOpen, orderJobArtifacts } from "../artifacts.ts";
import { buildCapRunInput, capPrimaryField } from "../cap-run-input.ts";
import { clampSelectId } from "../clamp-select.ts";
import { buildJobDetailView } from "../job-detail-view.ts";
import {
  filterJobQueue,
  groupJobsForQueue,
  playbookRunProgress,
  playbookRunStatus,
  playbookWaitingOnNextStep,
} from "../status.ts";

function job(overrides: Partial<JobListRecord> = {}): JobListRecord {
  return {
    id: testId(11),
    caseId: testId(10),
    capabilityId: "network.dns.lookup",
    status: "queued",
    input: { host: "mailhost.test" },
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
    playbookRunId: null,
    playbookId: null,
    playbookRunStatus: null,
    playbookStep: null,
    evidenceIds: [],
    output: [],
    actorId: "test-actor",
    actorLabel: "test-actor",
    ...overrides,
    playbookFanIndex: overrides.playbookFanIndex ?? 0,
  };
}

describe("job artifacts", () => {
  it("orders derived then report", () => {
    const ordered = orderJobArtifacts([
      { name: "notes.txt" },
      { name: "report.json" },
      { name: "derived.json" },
    ]);
    expect(ordered.map((row) => row.name)).toEqual([
      "derived.json",
      "report.json",
      "notes.txt",
    ]);
    expect(artifactDefaultOpen("evidence-snapshot.json", 0)).toBe(false);
  });
});

describe("job status queue", () => {
  it("filters, groups playbook steps, and aggregates run status", () => {
    const queued = job();
    const running = job({
      id: testId(12),
      status: "running",
      playbookRunId: testId(90),
      playbookStep: 0,
    });
    const blocked = job({
      id: testId(13),
      status: "blocked",
      playbookRunId: testId(90),
      playbookStep: 1,
    });
    const filtered = filterJobQueue([queued, running], {
      q: "",
      statuses: ["queued"],
      capabilityIds: [],
    });
    expect(filtered).toHaveLength(1);
    const grouped = groupJobsForQueue([running, blocked, queued]);
    expect(grouped.some((entry) => entry.kind === "playbook")).toBe(true);
    expect(playbookRunStatus([running, blocked])).toBe("running");
    expect(playbookRunProgress([running], 5)).toEqual({ done: 0, total: 5 });
    expect(playbookRunStatus([job({ status: "succeeded" })], 5)).toBe("queued");
    expect(playbookWaitingOnNextStep([job({ status: "succeeded" })], 5)).toBe(
      true
    );
    expect(playbookWaitingOnNextStep([running], 5)).toBe(false);
    expect(
      playbookRunProgress(
        [job({ status: "succeeded", playbookStep: 0 })],
        2,
        "finished"
      )
    ).toEqual({ done: 2, total: 2 });
    expect(
      playbookWaitingOnNextStep(
        [job({ status: "succeeded", playbookStep: 0 })],
        2,
        "finished"
      )
    ).toBe(false);
  });
});

describe("job detail + run input + clamp", () => {
  it("builds a cancellable queued detail view", () => {
    const view = buildJobDetailView({
      job: { ...job(), logs: [] },
      playbookSteps: null,
    });
    expect(view.canCancel).toBe(true);
    expect(view.inputHint).toBe("mailhost.test");
  });

  it("picks host as the primary field", () => {
    expect(
      capPrimaryField({
        type: "object",
        properties: { host: { type: "string" } },
      }).key
    ).toBe("host");
    expect(
      buildCapRunInput(
        { type: "object", properties: { host: { type: "string" } } },
        "mailhost.test",
        testId(20)
      )
    ).toEqual({ host: "mailhost.test", entityId: testId(20) });
    expect(clampSelectId("gone", ["a", "b"])).toBe("a");
  });

  it("uses schema description for query placeholder", () => {
    expect(
      capPrimaryField({
        type: "object",
        properties: {
          query: { type: "string", description: "IP or domain" },
        },
      }).placeholder
    ).toBe("IP or domain");
    expect(
      capPrimaryField({
        type: "object",
        properties: { hash: { type: "string" } },
      })
    ).toEqual({ key: "hash", placeholder: "MD5 or SHA-256 file hash" });
  });
});
