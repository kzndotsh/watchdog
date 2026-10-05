import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { requireCapability } from "@watchdog/caps";
import { recordingBlobStore, type BlobStore } from "@watchdog/core/blob";
import type { JobRow } from "@watchdog/db";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

const { loadCapReportEffect } = vi.hoisted(() => ({
  loadCapReportEffect: vi.fn(),
}));

vi.mock("../../load-cap-report", () => ({
  loadCapReportEffect,
}));

const runStage = <A>(effect: Effect.Effect<A, never, BlobStore>) =>
  Effect.runPromise(effect.pipe(Effect.provide(recordingBlobStore().layer)));

import type { CollectRuntime } from "../collect";
import { createJobLog } from "../helpers";
import { interpretStageEffect, logInterpretFailure } from "../interpret";
import type { PreflightState } from "../preflight";

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
    interpretError: null,
    proposalId: null,
    evidenceIds: null,
    resultSummary: null,
    fromCache: false,
    suppressedCount: 0,
    actorId: "actor",
    actorLabel: null,
    logs: [],
    playbookRunId: null,
    playbookStep: null,
    playbookFanIndex: 0,
    handoff: null,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    finishedAt: null,
  };
}

function makeState(
  interpret: PreflightState["cap"]["interpret"]
): PreflightState {
  return {
    jobId: testId(1),
    job: makeJobRow(),
    cap: {
      ...requireCapability("network.dns.lookup"),
      interpret,
      handoff: undefined,
    },
    policy: {},
    input: {},
    allowThirdPartyEgress: false,
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

describe("interpret stage", () => {
  it("logInterpretFailure appends log line and fallback summary", () => {
    const jobLog = createJobLog();
    const summary = logInterpretFailure(jobLog, "bad patch", null);
    expect(summary).toContain("interpretation failed");
    expect(jobLog.lines.some((line) => line.includes("interpret failed"))).toBe(
      true
    );
  });

  it("returns early when interpret and handoff are not needed", async () => {
    const runtime = {
      evidenceSnapshot: undefined,
    } as CollectRuntime;
    const state = {
      cap: {},
      input: {},
    } as PreflightState;

    const result = await runStage(
      interpretStageEffect(state, [], runtime, {
        proposalId: null,
        resultSummary: "cached",
      })
    );

    expect(result.resultSummary).toBe("cached");
    expect(result.patch).toEqual([]);
    expect(result.interpretError).toBeNull();
  });

  it("captures interpret errors when report.json is missing", async () => {
    loadCapReportEffect.mockReturnValueOnce(Effect.succeed(null));
    const runtime = makeRuntime();
    const state = makeState(vi.fn());

    const result = await runStage(
      interpretStageEffect(state, [], runtime, {
        proposalId: null,
        resultSummary: null,
      })
    );

    expect(result.interpretError).toContain("No report.json");
  });

  it("trims padded interpret summary", async () => {
    loadCapReportEffect.mockReturnValueOnce(
      Effect.succeed({ report: { ok: true } })
    );
    const entityId = testId(20);
    const runtime = makeRuntime();
    const state = makeState(
      vi.fn().mockReturnValue({
        summary: "  dns ok  ",
        patch: [
          {
            op: "create",
            resource: "claim",
            id: testId(21),
            data: {
              entityId,
              text: "observed",
              class: "observation",
            },
          },
        ],
      })
    );

    const result = await runStage(
      interpretStageEffect(state, [], runtime, {
        proposalId: null,
        resultSummary: null,
      })
    );

    expect(result.resultSummary).toBe("dns ok");
    expect(result.interpretError).toBeNull();
  });

  it("passes trimmed snapshot text length to interpret", async () => {
    const interpret = vi.fn().mockReturnValue({
      summary: null,
      patch: [],
      markSourceProcessed: false,
    });
    loadCapReportEffect.mockReturnValueOnce(
      Effect.succeed({ report: { ok: true } })
    );
    const runtime = makeRuntime({
      evidenceSnapshot: {
        evidenceId: testId(30),
        caseId: testId(2),
        kind: "other",
        text: "   \n  ",
        packedAt: "2026-01-03T00:00:00.000Z",
        packerVersion: 1,
      },
    });
    const state = makeState(interpret);

    await runStage(
      interpretStageEffect(state, [], runtime, {
        proposalId: null,
        resultSummary: null,
      })
    );

    expect(interpret).toHaveBeenCalledWith(
      { ok: true },
      expect.objectContaining({ snapshotTextChars: 0 })
    );
  });
});
