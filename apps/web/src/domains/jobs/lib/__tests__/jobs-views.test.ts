import { describe, expect, it } from "vitest";

import { buildJobListRecord } from "@/testing/records";
import { testId } from "@watchdog/test-kit";

import { artifactDefaultOpen, orderJobArtifacts } from "../artifacts.ts";
import { buildCapRunInput, capPrimaryField } from "../cap-run-input.ts";
import { clampSelectId } from "../clamp-select.ts";
import {
  buildJobDetailView,
  playbookWaitingMessage,
} from "../job-detail-view.ts";
import {
  filterJobQueue,
  groupJobsForQueue,
  jobActivityAt,
  playbookRunProgress,
  currentAttempts,
  playbookRunStatus,
  playbookWaitingOnNextStep,
  sortJobQueue,
} from "../status.ts";

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

describe("currentAttempts", () => {
  it("drops a Job that a later attempt retried, so a resumed step is not failed", () => {
    const failed = buildJobListRecord({
      id: testId(20),
      status: "failed",
      playbookRunId: testId(90),
      playbookStep: 0,
    });
    const retry = buildJobListRecord({
      id: testId(21),
      status: "succeeded",
      retryOfJobId: failed.id,
      playbookRunId: testId(90),
      playbookStep: 0,
    });
    const other = buildJobListRecord({
      id: testId(22),
      status: "succeeded",
      playbookRunId: testId(90),
      playbookStep: 1,
    });

    expect(currentAttempts([failed, retry, other])).toEqual([retry, other]);
    expect(playbookRunStatus([failed, retry, other], 2, "finished")).toBe(
      "succeeded"
    );
    expect(playbookRunStatus([failed, other], 2, "finished")).toBe("failed");
  });
});

describe("job status queue", () => {
  it("sortJobQueue prefers updatedAt over createdAt", () => {
    const older = buildJobListRecord({
      id: testId(20),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = buildJobListRecord({
      id: testId(21),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(sortJobQueue([older, newer]).map((row) => row.id)).toEqual([
      testId(21),
      testId(20),
    ]);
    expect(jobActivityAt(older)).toBe("2026-01-01T00:00:00.000Z");
  });

  it("filters, groups playbook steps, and aggregates run status", () => {
    const queued = buildJobListRecord();
    const running = buildJobListRecord({
      id: testId(12),
      status: "running",
      playbookRunId: testId(90),
      playbookStep: 0,
    });
    const nextStep = buildJobListRecord({
      id: testId(13),
      status: "queued",
      playbookRunId: testId(90),
      playbookStep: 1,
    });
    const filtered = filterJobQueue([queued, running], {
      q: "",
      statuses: ["queued"],
      capabilityIds: [],
    });
    expect(filtered).toHaveLength(1);
    const grouped = groupJobsForQueue([running, nextStep, queued]);
    expect(grouped.some((entry) => entry.kind === "playbook")).toBe(true);
    const playbookEntry = grouped.find((entry) => entry.kind === "playbook");
    expect(playbookEntry?.playbookId).toBe(testId(90));
    expect(playbookRunStatus([running, nextStep])).toBe("running");
    expect(playbookRunStatus([queued, nextStep])).toBe("queued");
    expect(playbookRunProgress([running], 5)).toEqual({ done: 0, total: 5 });
    expect(
      playbookRunStatus([buildJobListRecord({ status: "succeeded" })], 5)
    ).toBe("queued");
    expect(
      playbookWaitingOnNextStep(
        [buildJobListRecord({ status: "succeeded" })],
        5
      )
    ).toBe(true);
    expect(playbookWaitingOnNextStep([running], 5)).toBe(false);
    expect(
      playbookRunProgress(
        [buildJobListRecord({ status: "succeeded", playbookStep: 0 })],
        2,
        "finished"
      )
    ).toEqual({ done: 2, total: 2 });
    expect(
      playbookWaitingOnNextStep(
        [buildJobListRecord({ status: "succeeded", playbookStep: 0 })],
        2,
        "finished"
      )
    ).toBe(false);
  });

  it("resolves playbook id from any step in the run", () => {
    const runId = testId(92);
    const step0 = buildJobListRecord({
      id: testId(18),
      playbookRunId: runId,
      playbookId: null,
      playbookStep: 0,
    });
    const step1 = buildJobListRecord({
      id: testId(19),
      playbookRunId: runId,
      playbookId: "host-footprint-lite",
      playbookStep: 1,
    });
    const grouped = groupJobsForQueue([step0, step1]);
    const entry = grouped.find((row) => row.kind === "playbook");
    expect(entry?.playbookId).toBe("host-footprint-lite");
  });

  it("groups playbook steps when run id is padded with whitespace", () => {
    const runId = testId(93);
    const step0 = buildJobListRecord({
      id: testId(40),
      playbookRunId: `  ${runId}  `,
      playbookStep: 0,
    });
    const step1 = buildJobListRecord({
      id: testId(41),
      playbookRunId: runId,
      playbookStep: 1,
    });
    const grouped = groupJobsForQueue([step0, step1]);
    expect(grouped).toHaveLength(1);
    const entry = grouped[0];
    expect(entry?.kind).toBe("playbook");
    if (entry?.kind === "playbook") {
      expect(entry.runId).toBe(runId);
      expect(entry.steps).toHaveLength(2);
    }
  });

  it("filters by capability display label", () => {
    const shodan = buildJobListRecord({
      id: testId(14),
      capabilityId: "network.shodan.lookup",
      input: { ip: "198.51.100.1" },
    });
    const filtered = filterJobQueue([shodan], {
      q: "shodan lookup",
      statuses: [],
      capabilityIds: [],
    });
    expect(filtered.map((row) => row.id)).toEqual([shodan.id]);
  });

  it("filters by humanized capability id", () => {
    const shodan = buildJobListRecord({
      id: testId(20),
      capabilityId: "network.shodan.lookup",
      input: { ip: "198.51.100.1" },
    });
    const filtered = filterJobQueue([shodan], {
      q: "network shodan",
      statuses: [],
      capabilityIds: [],
    });
    expect(filtered.map((row) => row.id)).toEqual([shodan.id]);
  });

  it("filters by playbook display label", () => {
    const playbookJob = buildJobListRecord({
      id: testId(15),
      playbookRunId: testId(90),
      playbookId: "host-footprint-lite",
      playbookStep: 0,
      capabilityId: "network.dns.lookup",
    });
    const filtered = filterJobQueue([playbookJob], {
      q: "footprint lite",
      statuses: [],
      capabilityIds: [],
    });
    expect(filtered.map((row) => row.id)).toEqual([playbookJob.id]);
  });

  it("filters by resolved entity title in job input", () => {
    const entityId = testId(21);
    const scoped = buildJobListRecord({
      id: testId(22),
      capabilityId: "network.shodan.lookup",
      input: { entityId },
    });
    const filtered = filterJobQueue(
      [scoped],
      { q: "acme corp", statuses: [], capabilityIds: [] },
      undefined,
      new Map([[entityId, "Acme Corp"]])
    );
    expect(filtered.map((row) => row.id)).toEqual([scoped.id]);
  });

  it("filters by job error and interpret error", () => {
    const failed = buildJobListRecord({
      id: testId(18),
      status: "failed",
      error: "Connection timed out",
    });
    const interpretFailed = buildJobListRecord({
      id: testId(19),
      status: "failed",
      interpretError: "proposal payload invalid",
    });
    expect(
      filterJobQueue([failed], {
        q: "timed out",
        statuses: [],
        capabilityIds: [],
      }).map((row) => row.id)
    ).toEqual([failed.id]);
    expect(
      filterJobQueue([interpretFailed], {
        q: "payload invalid",
        statuses: [],
        capabilityIds: [],
      }).map((row) => row.id)
    ).toEqual([interpretFailed.id]);
  });

  it("filters by job status and display label", () => {
    const failed = buildJobListRecord({
      id: testId(20),
      status: "failed",
    });
    expect(
      filterJobQueue([failed], {
        q: "failed",
        statuses: [],
        capabilityIds: [],
      }).map((row) => row.id)
    ).toEqual([failed.id]);
  });
});

describe("job detail + run input + clamp", () => {
  it("builds a cancellable queued detail view", () => {
    const view = buildJobDetailView({
      job: { ...buildJobListRecord(), logs: [] },
    });
    expect(view.canCancel).toBe(true);
    expect(view.canRetry).toBe(false);
    expect(view.inputHint).toBe("mailhost.test");
  });

  it.each(["failed", "cancelled", "succeeded"] as const)(
    "offers Retry, not Cancel, on a %s job",
    (status) => {
      const view = buildJobDetailView({
        job: { ...buildJobListRecord({ status }), logs: [], output: null },
      });
      expect(view.canRetry).toBe(true);
      expect(view.canCancel).toBe(false);
      expect(view.shouldShowFooter).toBe(true);
    }
  );

  it("offers the expiring download, not Retry, on a succeeded Case export Job", () => {
    const job = buildJobListRecord({
      status: "succeeded",
      capabilityId: "system.case_export",
    });
    const view = buildJobDetailView({
      job: { ...job, logs: [], output: null },
    });
    expect(view.exportDownloadPath).toBe(
      `/api/v1/cases/${job.caseId}/exports/${job.id}`
    );
    expect(view.canRetry).toBe(false);
    expect(view.shouldShowFooter).toBe(true);
  });

  it("offers no download on a running Case export Job or on a Cap Job", () => {
    const running = buildJobListRecord({
      status: "running",
      capabilityId: "system.case_export",
    });
    expect(
      buildJobDetailView({ job: { ...running, logs: [], output: null } })
        .exportDownloadPath
    ).toBeNull();
    const cap = buildJobListRecord({ status: "succeeded" });
    expect(
      buildJobDetailView({ job: { ...cap, logs: [], output: null } })
        .exportDownloadPath
    ).toBeNull();
  });

  it.each(["queued", "running"] as const)(
    "does not offer Retry on a %s job",
    (status) => {
      const view = buildJobDetailView({
        job: { ...buildJobListRecord({ status }), logs: [], output: null },
      });
      expect(view.canRetry).toBe(false);
    }
  );

  it("uses updatedAt for ranInstant when the job never started", () => {
    const view = buildJobDetailView({
      job: {
        ...buildJobListRecord({
          startedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T12:00:00.000Z",
          status: "queued",
        }),
        logs: [],
      },
    });
    expect(view.ranInstant).toBe("2026-01-02T12:00:00.000Z");
  });

  it("prefers seed fields in input hint over incidental string keys", () => {
    const view = buildJobDetailView({
      job: {
        ...buildJobListRecord({ capabilityId: "network.shodan.lookup" }),
        input: {
          notes: "re-scan",
          ip: "198.51.100.1",
          entityId: testId(20),
        },
        logs: [],
      },
    });
    expect(view.inputHint).toBe("198.51.100.1");
  });

  it("resolves entity title in input hint when provided", () => {
    const entityId = testId(20);
    const view = buildJobDetailView({
      job: {
        ...buildJobListRecord({ capabilityId: "network.shodan.lookup" }),
        input: { entityId },
        logs: [],
      },
      entityTitleById: new Map([[entityId, "Acme Corp"]]),
    });
    expect(view.inputHint).toBe("Acme Corp");
  });

  it("treats whitespace-only proposalId as absent", () => {
    const view = buildJobDetailView({
      job: {
        ...buildJobListRecord({ proposalId: "   " }),
        logs: [],
      },
    });
    expect(view.proposalId).toBeNull();
    expect(view.shouldShowFooter).toBe(true);
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
    expect(
      buildCapRunInput(
        { type: "object", properties: { host: { type: "string" } } },
        "mailhost.test",
        `  ${testId(20)}  `
      )
    ).toEqual({ host: "mailhost.test", entityId: testId(20) });
    expect(
      buildCapRunInput(
        { type: "object", properties: { host: { type: "string" } } },
        "mailhost.test",
        "   "
      )
    ).toEqual({ host: "mailhost.test" });
    expect(clampSelectId("gone", ["a", "b"])).toBe("a");
    expect(clampSelectId("  b  ", ["a", "b"])).toBe("b");
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

  it("playbookWaitingMessage is null without steps", () => {
    expect(playbookWaitingMessage({ playbookSteps: [] })).toBeNull();
  });

  it("playbookWaitingMessage reports a run waiting on its next step", () => {
    const steps = [
      buildJobListRecord({
        id: testId(23),
        status: "succeeded",
        playbookRunId: testId(90),
        playbookStep: 0,
        capabilityId: "network.dns.lookup",
      }),
    ];
    expect(
      playbookWaitingMessage({ playbookSteps: steps, recipeTotal: 2 })
    ).toBe("Waiting to queue the next playbook step.");
  });
});
