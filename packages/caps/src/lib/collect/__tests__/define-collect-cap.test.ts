import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { uploadJsonReportPairMock } = vi.hoisted(() => ({
  uploadJsonReportPairMock: vi.fn(
    (_upload: unknown, _snap: unknown, name: string) =>
      Effect.succeed({
        report: { id: "report", mime: "application/json", name: "report.json" },
        artifact: { id: "artifact", mime: "application/json", name },
      })
  ),
}));

vi.mock("../upload-json-report-pair", () => ({
  uploadJsonReportPair: uploadJsonReportPairMock,
}));

import { runCap } from "@watchdog/cap-sdk";

import { defineCollectCap } from "../define-collect-cap";

const baseDef = {
  id: "test.collect",
  version: "1",
  title: "Test collect",
  description: "unit test cap",
  dataSource: "test",
  input: z.object({}),
  schema: z.object({ ok: z.boolean() }),
  reportLabel: "test",
};

describe("defineCollectCap", () => {
  it("run fetches snap and uploads report pair", async () => {
    const interpretSnap = vi
      .fn()
      .mockResolvedValue({ patch: [], summary: "done" });
    const fetch = vi.fn(() =>
      Effect.succeed({ snap: { ok: true }, artifactName: "data.json" })
    );
    const uploadArtifact = vi.fn((input: { name?: string }) =>
      Effect.succeed({
        id: "upload-1",
        ...input,
      })
    );

    const cap = defineCollectCap({
      ...baseDef,
      fetch,
      interpretSnap,
    });

    const runResult = await runCap(
      cap.run({
        input: {},
        uploadArtifact,
        log: () => {},
        signal: AbortSignal.timeout(1000),
        getCredential: () => Effect.die(new Error("unused")),
      } as never)
    );

    expect(fetch).toHaveBeenCalled();
    expect(uploadJsonReportPairMock).toHaveBeenCalled();
    expect(runResult.artifacts).toHaveLength(2);
  });

  it("interpret parses report via schema and delegates to interpretSnap", () => {
    const interpretSnap = vi
      .fn()
      .mockReturnValue({ patch: [], summary: "interpreted" });

    const cap = defineCollectCap({
      ...baseDef,
      fetch: vi.fn(),
      interpretSnap,
    });

    const result = cap.interpret!({ ok: true }, { input: {} });
    expect(interpretSnap).toHaveBeenCalledWith({ ok: true }, expect.anything());
    expect(result.summary).toBe("interpreted");
  });

  it("interpret throws on invalid report shape", () => {
    const cap = defineCollectCap({
      ...baseDef,
      fetch: vi.fn(),
      interpretSnap: vi.fn(),
    });

    expect(() => cap.interpret!({ bad: true }, {} as never)).toThrow(
      /Invalid test report/
    );
  });
});
