import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

const { loadCapReportEffect } = vi.hoisted(() => ({
  loadCapReportEffect: vi.fn(),
}));

vi.mock("../../load-cap-report", () => ({
  loadCapReportEffect,
}));

vi.mock("../../infra/blob", () => ({
  readArtifactBytesEffect: vi.fn(),
}));

import type { CollectRuntime } from "../collect";
import { createJobLog } from "../helpers";
import { interpretStageEffect, logInterpretFailure } from "../interpret";
import type { PreflightState } from "../preflight";

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

    const result = await Effect.runPromise(
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
    const runtime = { evidenceSnapshot: undefined } as CollectRuntime;
    const state = {
      cap: { interpret: vi.fn() },
      input: {},
    } as PreflightState;

    const result = await Effect.runPromise(
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
    const runtime = { evidenceSnapshot: undefined } as CollectRuntime;
    const state = {
      cap: {
        interpret: vi.fn().mockReturnValue({
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
        }),
      },
      input: {},
    } as PreflightState;

    const result = await Effect.runPromise(
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
    const runtime = {
      evidenceSnapshot: { text: "   \n  ", entityId: null },
    } as CollectRuntime;
    const state = {
      cap: { interpret },
      input: {},
    } as PreflightState;

    await Effect.runPromise(
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
