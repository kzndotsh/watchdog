import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { REPORT_JSON_ARTIFACT } from "@watchdog/schemas";

import { uploadJsonReportPair } from "../upload-json-report-pair";

describe("uploadJsonReportPair", () => {
  it("uploads report.json and a named artifact with the same JSON body", async () => {
    const uploads: { name?: string; mime: string }[] = [];
    const uploadArtifact = vi.fn((input: { name?: string; mime: string }) => {
      uploads.push(input);
      return Effect.succeed({
        mime: input.mime,
        name: input.name ?? "artifact",
        uri: `s3://test/${input.name ?? "artifact"}`,
        sha256: "abc",
      });
    });

    const snap = { ok: true, count: 2 };
    const result = await Effect.runPromise(
      uploadJsonReportPair(uploadArtifact, snap, "lookup.json")
    );

    expect(uploadArtifact).toHaveBeenCalledTimes(2);
    expect(uploads[0]?.name).toBe(REPORT_JSON_ARTIFACT);
    expect(uploads[1]?.name).toBe("lookup.json");
    expect(result.report.name).toBe(REPORT_JSON_ARTIFACT);
    expect(result.artifact.name).toBe("lookup.json");
  });
});
