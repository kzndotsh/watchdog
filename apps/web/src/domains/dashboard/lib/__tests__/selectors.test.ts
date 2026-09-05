import { describe, expect, it } from "vitest";

import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import type { TaskRecord } from "@/domains/tasks/types";
import { testId } from "@watchdog/test-kit";

import { countLiveJobs, selectDueTasks } from "../selectors.ts";

function job(status: JobListRecord["status"]): JobListRecord {
  return {
    id: testId(11),
    caseId: testId(10),
    capabilityId: "network.dns.lookup",
    status,
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
}

describe("dashboard selectors", () => {
  it("counts live jobs and due tasks", () => {
    expect(countLiveJobs([job("queued"), job("succeeded")])).toBe(1);
    const overdue: TaskRecord = {
      id: "t1",
      caseId: "c",
      entityId: null,
      title: "Late",
      description: null,
      status: "backlog",
      priority: null,
      dueDate: "2000-01-01T12:00:00.000Z",
      position: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(selectDueTasks([overdue]).map((row) => row.id)).toEqual(["t1"]);
  });
});
