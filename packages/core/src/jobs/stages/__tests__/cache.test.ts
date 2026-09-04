import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

const { storeCapCacheEffect } = vi.hoisted(() => ({
  storeCapCacheEffect: vi.fn(),
}));

vi.mock("../../cap-cache", () => ({
  storeCapCacheEffect,
}));

import { storeCacheStageEffect } from "../cache";
import type { CollectRuntime } from "../collect";
import type { PreflightState } from "../preflight";

function makeRuntime(overrides: Partial<CollectRuntime> = {}): CollectRuntime {
  return {
    scratchDir: "/tmp",
    signal: new AbortController().signal,
    jobLog: { lines: [], log: vi.fn() },
    evidenceSnapshot: undefined,
    linkedSource: undefined,
    cacheTtlMs: 60_000,
    inputHash: "abc123",
    ...overrides,
  };
}

function makeState(): PreflightState {
  return {
    jobId: "job-1",
    job: { caseId: "case-1" } as PreflightState["job"],
    cap: { id: "network.dns.lookup" } as PreflightState["cap"],
  } as PreflightState;
}

describe("storeCacheStage", () => {
  it("skips when cache is disabled or result came from cache", async () => {
    await Effect.runPromise(
      storeCacheStageEffect({
        state: makeState(),
        runtime: makeRuntime({ cacheTtlMs: null }),
        artifacts: [],
        resultSummary: "ok",
        fromCache: false,
        reclaim: false,
        interpretError: null,
      })
    );
    expect(storeCapCacheEffect).not.toHaveBeenCalled();

    storeCapCacheEffect.mockClear();
    await Effect.runPromise(
      storeCacheStageEffect({
        state: makeState(),
        runtime: makeRuntime(),
        artifacts: [],
        resultSummary: "ok",
        fromCache: true,
        reclaim: false,
        interpretError: null,
      })
    );
    expect(storeCapCacheEffect).not.toHaveBeenCalled();
  });

  it("persists cache entry for fresh successful collect runs", async () => {
    storeCapCacheEffect.mockReturnValue(Effect.void);
    const runtime = makeRuntime();
    await Effect.runPromise(
      storeCacheStageEffect({
        state: makeState(),
        runtime,
        artifacts: [
          {
            name: "report.json",
            mime: "application/json",
            uri: "u",
            sha256: "s",
          },
        ],
        resultSummary: "done",
        fromCache: false,
        reclaim: false,
        interpretError: null,
      })
    );
    expect(storeCapCacheEffect).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: "case-1",
        capabilityId: "network.dns.lookup",
        inputHash: "abc123",
        ttlMs: 60_000,
      })
    );
  });
});
