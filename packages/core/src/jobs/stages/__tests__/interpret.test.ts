import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { requireCapability } from "@watchdog/caps";
import { recordingBlobStore } from "@watchdog/core/blob";
import type { JobArtifact, JobRow } from "@watchdog/db";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

import { createJobLog } from "../../job-log";
import type { CollectRuntime } from "../collect";
import { interpretStageEffect, logInterpretFailure } from "../interpret";
import type { PreflightState } from "../preflight";

const REPORT_URI = "jobs/report.json";

/** Runs the stage against a blob store holding `report` as the Job's `report.json`. */
function runStage(
  state: PreflightState,
  runtime: CollectRuntime,
  report?: unknown
) {
  const store = recordingBlobStore();
  const artifacts: JobArtifact[] = [];
  if (report !== undefined) {
    store.objects.set(
      REPORT_URI,
      new TextEncoder().encode(JSON.stringify(report))
    );
    artifacts.push({
      name: "report.json",
      mime: "application/json",
      uri: REPORT_URI,
      sha256: "a".repeat(64),
    });
  }
  return Effect.runPromise(
    interpretStageEffect(state, artifacts, runtime, {
      proposalId: null,
      resultSummary: "cached",
    }).pipe(Effect.provide(store.layer))
  );
}

function makeJobRow(): JobRow {
  const now = new Date("2026-01-03T00:00:00.000Z");
  return {
    id: testId(1),
    caseId: testCaseId(2),
    capabilityId: "network.dns.lookup",
    input: {},
    output: null,
    status: "running",
    error: null,
    errorCode: null,
    interpretError: null,
    proposalId: null,
    evidenceIds: [],
    resultSummary: null,
    fromCache: false,
    suppressedCount: 0,
    actorId: "actor",
    actorLabel: null,
    actorKeyId: null,
    logs: [],
    playbookRunId: null,
    playbookStep: null,
    playbookFanIndex: 0,
    retryOfJobId: null,
    pivots: null,
    capVersion: null,
    cacheSourceJobId: null,
    provenanceState: "complete",
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    finishedAt: null,
  };
}

function makeState(
  overrides: Partial<PreflightState["cap"]> = {}
): PreflightState {
  return {
    jobId: testId(1),
    job: makeJobRow(),
    capVersion: "test-version",
    cap: { ...requireCapability("network.dns.lookup"), ...overrides },
    policy: {},
    input: { host: "mailhost.test" },
    reclaimArtifacts: null,
    reclaimEvidenceIds: [],
  };
}

function makeRuntime(overrides: Partial<CollectRuntime> = {}): CollectRuntime {
  return {
    scratchDir: "/tmp",
    signal: new AbortController().signal,
    jobLog: createJobLog(),
    evidenceSnapshot: undefined,
    linkedSource: undefined,
    cacheTtlMs: null,
    inputHash: null,
    ...overrides,
  };
}

const DNS_REPORT = {
  host: "mailhost.test",
  a: ["93.184.216.34"],
  aaaa: [],
  mx: [],
  txt: [],
  ns: ["ns1.mailhost.test."],
};

describe("interpret stage", () => {
  it("logInterpretFailure appends log line and fallback summary", () => {
    const jobLog = createJobLog();
    const summary = logInterpretFailure(jobLog, "bad patch", null);
    expect(summary).toContain("interpretation failed");
    expect(jobLog.lines.some((line) => line.includes("interpret failed"))).toBe(
      true
    );
  });

  it("returns the existing summary and no patch when the Cap neither interprets nor pivots", async () => {
    const state = makeState({ interpret: undefined, pivots: undefined });

    const result = await runStage(state, makeRuntime());

    expect(result.resultSummary).toBe("cached");
    expect(result.patch).toEqual([]);
    expect(result.interpretError).toBeNull();
  });

  it("captures an interpret error when report.json is missing", async () => {
    const result = await runStage(makeState(), makeRuntime());

    expect(result.interpretError).toContain("No report.json");
    expect(result.patch).toEqual([]);
  });

  it("interprets a real DNS report into the Cap's summary and Identifier patch", async () => {
    const entityId = testId(20);
    const state = makeState();
    state.input = { host: "mailhost.test", entityId };

    const result = await runStage(state, makeRuntime(), DNS_REPORT);

    expect(result.interpretError).toBeNull();
    expect(result.resultSummary).toContain("93.184.216.34");
    expect(
      result.patch.some(
        (op) => op.op === "create" && op.resource === "identifier"
      )
    ).toBe(true);
  });

  it("reports an interpret patch the graph would refuse as an error, with no patch", async () => {
    const state = makeState({
      interpret: () => ({
        summary: "dns ok",
        patch: [
          { op: "create", resource: "claim", id: "not-a-uuid", data: {} },
        ],
      }),
    });

    const result = await runStage(state, makeRuntime(), DNS_REPORT);

    expect(result.interpretError).toContain("interpret patch invalid");
    expect(result.patch).toEqual([]);
  });

  it("trims a padded interpret summary", async () => {
    const state = makeState({
      interpret: () => ({ summary: "  dns ok  ", patch: [] }),
    });

    const result = await runStage(state, makeRuntime(), DNS_REPORT);

    expect(result.resultSummary).toBe("dns ok");
    expect(result.interpretError).toBeNull();
  });

  it("tells interpret the trimmed length of the snapshot text", async () => {
    let seen: number | undefined;
    const state = makeState({
      interpret: (_report, opts) => {
        seen = opts.snapshotTextChars;
        return { patch: [] };
      },
    });
    const runtime = makeRuntime({
      evidenceSnapshot: {
        evidenceId: testId(30),
        caseId: testCaseId(2),
        kind: "other",
        text: "   \n  ",
        packedAt: "2026-01-03T00:00:00.000Z",
        packerVersion: 1,
      },
    });

    await runStage(state, runtime, DNS_REPORT);

    expect(seen).toBe(0);
  });
});
