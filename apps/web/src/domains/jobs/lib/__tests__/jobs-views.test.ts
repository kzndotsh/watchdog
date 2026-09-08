import { describe, expect, it } from "vitest";

import type { JobListRecord } from "@/domains/jobs/types";
import { testId } from "@watchdog/test-kit";

import { artifactDefaultOpen, orderJobArtifacts } from "../artifacts.ts";
import { buildCapRunInput, capPrimaryField } from "../cap-run-input.ts";
import { clampSelectId } from "../clamp-select.ts";
import {
  buildJobDetailView,
  playbookBlockedWaitingMessage,
} from "../job-detail-view.ts";
import {
  capabilityFacetOptions,
  filterJobQueue,
  groupJobsForQueue,
  jobActivityAt,
  playbookRunProgress,
  playbookRunStatus,
  playbookWaitingOnNextStep,
  sortJobQueue,
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
  it("sortJobQueue prefers updatedAt over createdAt", () => {
    const older = job({
      id: testId(20),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = job({
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
    const playbookEntry = grouped.find((entry) => entry.kind === "playbook");
    expect(playbookEntry?.playbookId).toBe(testId(90));
    expect(playbookRunStatus([running, blocked])).toBe("running");
    expect(playbookRunStatus([queued, blocked])).toBe("blocked");
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

  it("resolves playbook id from any step in the run", () => {
    const runId = testId(92);
    const step0 = job({
      id: testId(18),
      playbookRunId: runId,
      playbookId: null,
      playbookStep: 0,
    });
    const step1 = job({
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
    const step0 = job({
      id: testId(40),
      playbookRunId: `  ${runId}  `,
      playbookStep: 0,
    });
    const step1 = job({
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
    const shodan = job({
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
    const shodan = job({
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
    const playbookJob = job({
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
    const scoped = job({
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
    const failed = job({
      id: testId(18),
      status: "failed",
      error: "Connection timed out",
    });
    const interpretFailed = job({
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
    const failed = job({
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

describe("capabilityFacetOptions", () => {
  it("uses human labels for capability facets", () => {
    const options = capabilityFacetOptions([
      job({ capabilityId: "network.shodan.lookup" }),
      job({ id: testId(16), capabilityId: "network.dns.lookup" }),
    ]);
    expect(options).toEqual([
      { value: "network.dns.lookup", label: "DNS Lookup" },
      { value: "network.shodan.lookup", label: "Shodan Lookup" },
    ]);
  });

  it("includes playbook facets and filters by playbook id", () => {
    const playbookJob = job({
      id: testId(17),
      capabilityId: "network.dns.lookup",
      playbookId: "host-footprint",
      playbookRunId: testId(91),
      playbookStep: 0,
    });
    const options = capabilityFacetOptions([playbookJob, job()]);
    expect(options).toEqual([
      { value: "network.dns.lookup", label: "DNS Lookup" },
      { value: "host-footprint", label: "Host Footprint" },
    ]);
    const filtered = filterJobQueue([playbookJob, job()], {
      q: "",
      statuses: [],
      capabilityIds: ["host-footprint"],
    });
    expect(filtered.map((row) => row.id)).toEqual([playbookJob.id]);
  });
});

describe("job detail + run input + clamp", () => {
  it("builds a cancellable queued detail view", () => {
    const view = buildJobDetailView({
      job: { ...job(), logs: [] },
    });
    expect(view.canCancel).toBe(true);
    expect(view.inputHint).toBe("mailhost.test");
  });

  it("uses updatedAt for ranInstant when the job never started", () => {
    const view = buildJobDetailView({
      job: {
        ...job({
          startedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T12:00:00.000Z",
          status: "blocked",
        }),
        logs: [],
      },
    });
    expect(view.ranInstant).toBe("2026-01-02T12:00:00.000Z");
  });

  it("prefers seed fields in input hint over incidental string keys", () => {
    const view = buildJobDetailView({
      job: {
        ...job({ capabilityId: "network.shodan.lookup" }),
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
        ...job({ capabilityId: "network.shodan.lookup" }),
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
        ...job({ proposalId: "   " }),
        logs: [],
      },
    });
    expect(view.proposalId).toBeNull();
    expect(view.showFooter).toBe(true);
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

  it("playbookBlockedWaitingMessage does not blame a missing prior step on step 0", () => {
    const steps = [
      job({
        id: testId(21),
        status: "blocked",
        playbookRunId: testId(90),
        playbookStep: 0,
        capabilityId: "network.shodan.lookup",
        error: null,
      }),
    ];
    expect(
      playbookBlockedWaitingMessage({
        job: steps[0]!,
        playbookSteps: steps,
      })
    ).toBe("Blocked — waiting on credentials or setup.");
  });

  it("playbookBlockedWaitingMessage prefers job error text", () => {
    const steps = [
      job({
        id: testId(22),
        status: "blocked",
        playbookRunId: testId(90),
        playbookStep: 0,
        error: "Missing SHODAN_API_KEY",
      }),
    ];
    expect(
      playbookBlockedWaitingMessage({
        job: steps[0]!,
        playbookSteps: steps,
      })
    ).toBe("Missing SHODAN_API_KEY");
  });

  it("playbookBlockedWaitingMessage names the prior step when step > 0 is blocked", () => {
    const steps = [
      job({
        id: testId(23),
        status: "succeeded",
        playbookRunId: testId(90),
        playbookStep: 0,
        capabilityId: "network.dns.lookup",
      }),
      job({
        id: testId(24),
        status: "blocked",
        playbookRunId: testId(90),
        playbookStep: 1,
        capabilityId: "network.shodan.lookup",
        error: null,
      }),
    ];
    expect(
      playbookBlockedWaitingMessage({
        job: steps[1]!,
        playbookSteps: steps,
      })
    ).toBe("Blocked — waiting for DNS Lookup to finish.");
  });
});
