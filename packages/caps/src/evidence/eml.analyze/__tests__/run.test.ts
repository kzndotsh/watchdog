import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { REPORT_JSON_ARTIFACT } from "@watchdog/schemas";
import { createCapRunHarness, runCap, testId } from "@watchdog/test-kit";

import { emlAnalyze } from "../cap.ts";

const packedAt = "2026-01-01T00:00:00.000Z";
const SAMPLE_EML = [
  "From: ada@mailhost.test",
  "To: bob@example.com",
  "Subject: hello",
  "",
  "See https://example.com/x",
].join("\n");

describe("evidence.eml.analyze run", () => {
  it("analyzes text-only EML when uri is missing", async () => {
    const harness = createCapRunHarness({
      evidenceSnapshot: {
        evidenceId: testId(40),
        caseId: testId(10),
        kind: "file",
        text: SAMPLE_EML,
        packedAt,
        packerVersion: 1,
      },
    });
    const result = await runCap(
      emlAnalyze.run({
        ...harness.ctx,
        input: { evidenceId: testId(40) },
      })
    );
    expect(
      result.artifacts.some((row) => row.name === REPORT_JSON_ARTIFACT)
    ).toBe(true);
  });

  it("reads the artifact when uri is set", async () => {
    const uri = "s3://test/msg.eml";
    const harness = createCapRunHarness({
      evidenceSnapshot: {
        evidenceId: testId(40),
        caseId: testId(10),
        kind: "file",
        text: "From: ignore@example.com\n\nnope",
        uri,
        packedAt,
        packerVersion: 1,
      },
    });
    const result = await runCap(
      emlAnalyze.run({
        ...harness.ctx,
        input: { evidenceId: testId(40) },
        readArtifact: (requested) => {
          expect(requested).toBe(uri);
          return Effect.succeed(new TextEncoder().encode(SAMPLE_EML));
        },
      })
    );
    expect(
      result.artifacts.some((row) => row.name === REPORT_JSON_ARTIFACT)
    ).toBe(true);
  });

  it("throws when uri and text are both empty", async () => {
    const harness = createCapRunHarness({
      evidenceSnapshot: {
        evidenceId: testId(40),
        caseId: testId(10),
        kind: "file",
        text: "",
        packedAt,
        packerVersion: 1,
      },
    });
    await expect(
      runCap(
        emlAnalyze.run({
          ...harness.ctx,
          input: { evidenceId: testId(40) },
        })
      )
    ).rejects.toThrow(/no readable text/);
  });

  it("throws on non-UTF-8 artifact bytes", async () => {
    const harness = createCapRunHarness({
      evidenceSnapshot: {
        evidenceId: testId(40),
        caseId: testId(10),
        kind: "file",
        text: SAMPLE_EML,
        uri: "s3://test/binary.eml",
        packedAt,
        packerVersion: 1,
      },
    });
    await expect(
      runCap(
        emlAnalyze.run({
          ...harness.ctx,
          input: { evidenceId: testId(40) },
          readArtifact: () =>
            Effect.succeed(new Uint8Array([0xff, 0xfe, 0x00])),
        })
      )
    ).rejects.toThrow(/not valid UTF-8/);
  });
});
