import { Effect } from "effect";
import { describe, it, expect } from "vitest";

import {
  artifactsHaveCapReport,
  loadCapReportEffect,
} from "../load-cap-report.ts";

describe("load-cap-report", () => {
  it("loadCapReportEffect loads report.json", async () => {
    const loaded = await Effect.runPromise(
      loadCapReportEffect(
        [{ name: "report.json", uri: "s3://a/report.json" }],
        () =>
          Effect.succeed(
            new TextEncoder().encode(JSON.stringify({ kind: "report" }))
          )
      )
    );
    expect(loaded).toBeTruthy();
    expect(loaded?.name).toBe("report.json");
    expect(loaded?.report).toEqual({ kind: "report" });
  });

  it("loadCapReportEffect ignores non-report artifacts", async () => {
    const loaded = await Effect.runPromise(
      loadCapReportEffect(
        [
          { name: "dns-x.json", uri: "s3://a/x" },
          { name: "derived.json", uri: "s3://a/d" },
        ],
        () =>
          Effect.succeed(
            new TextEncoder().encode(JSON.stringify({ kind: "nope" }))
          )
      )
    );
    expect(loaded).toBe(null);
  });

  it("loadCapReportEffect returns null when missing", async () => {
    const loaded = await Effect.runPromise(
      loadCapReportEffect(
        [{ name: "other.json", uri: "s3://a/other.json" }],
        () => Effect.succeed(new Uint8Array())
      )
    );
    expect(loaded).toBe(null);
  });

  it("artifactsHaveCapReport detects report.json only", () => {
    expect(
      artifactsHaveCapReport([{ name: "dns-x.json", uri: "s3://a/x" }])
    ).toBe(false);
    expect(
      artifactsHaveCapReport([{ name: "report.json", uri: "s3://a/r" }])
    ).toBe(true);
    expect(
      artifactsHaveCapReport([{ name: "derived.json", uri: "s3://a/d" }])
    ).toBe(false);
  });
});
