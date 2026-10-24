import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { REPORT_JSON_ARTIFACT } from "@watchdog/schemas/jobs";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";
import { ValidationVendorError } from "@watchdog/tools/errors";
import { FILE_MAX_INPUT_BYTES } from "@watchdog/tools/file";

import type { ArtifactReadLimit } from "../../../sdk";
import { createCapRunHarness, runCap } from "../../../testing";
import { fileAnalyze } from "../cap.ts";

const packedAt = "2026-01-01T00:00:00.000Z";

describe("evidence.file.analyze run", () => {
  it("reads artifact bytes when uri is set", async () => {
    const uri = "s3://test/file.bin";
    const harness = createCapRunHarness({
      evidenceSnapshot: {
        evidenceId: testId(40),
        caseId: testCaseId(10),
        kind: "file",
        text: "SHOULD_NOT_USE",
        uri,
        packedAt,
        packerVersion: 1,
      },
    });
    const payload = new TextEncoder().encode("real-file-bytes");
    const result = await runCap(
      fileAnalyze.run({
        ...harness.ctx,
        input: { evidenceId: testId(40) },
        readArtifact: (requested) => {
          expect(requested).toBe(uri);
          return Effect.succeed(payload);
        },
      })
    );
    expect(
      result.artifacts.some((row) => row.name === REPORT_JSON_ARTIFACT)
    ).toBe(true);
  });

  it("analyzes nonempty snapshot text when uri is missing", async () => {
    const harness = createCapRunHarness({
      evidenceSnapshot: {
        evidenceId: testId(40),
        caseId: testCaseId(10),
        kind: "file",
        text: "pasted plaintext file",
        packedAt,
        packerVersion: 1,
      },
    });
    const result = await runCap(
      fileAnalyze.run({
        ...harness.ctx,
        input: { evidenceId: testId(40) },
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
        caseId: testCaseId(10),
        kind: "file",
        text: "   ",
        packedAt,
        packerVersion: 1,
      },
    });
    await expect(
      runCap(
        fileAnalyze.run({
          ...harness.ctx,
          input: { evidenceId: testId(40) },
        })
      )
    ).rejects.toThrow(/no bytes/);
  });

  it("does not fall back to text when readArtifact throws", async () => {
    const harness = createCapRunHarness({
      evidenceSnapshot: {
        evidenceId: testId(40),
        caseId: testCaseId(10),
        kind: "file",
        text: "fallback-text",
        uri: "s3://test/missing.bin",
        packedAt,
        packerVersion: 1,
      },
    });
    await expect(
      runCap(
        fileAnalyze.run({
          ...harness.ctx,
          input: { evidenceId: testId(40) },
          readArtifact: () => Effect.die(new Error("blob missing")),
        })
      )
    ).rejects.toThrow(/blob missing/);
  });

  it("refuses an artifact over the size cap", async () => {
    const harness = createCapRunHarness({
      evidenceSnapshot: {
        evidenceId: testId(40),
        caseId: testCaseId(10),
        kind: "file",
        text: "x",
        uri: "s3://test/huge.bin",
        packedAt,
        packerVersion: 1,
      },
    });
    await expect(
      runCap(
        fileAnalyze.run({
          ...harness.ctx,
          input: { evidenceId: testId(40) },
          readArtifact: () =>
            Effect.succeed(new Uint8Array(FILE_MAX_INPUT_BYTES + 1)),
        })
      )
    ).rejects.toThrow(/exceeds the 64 MiB analysis limit/);
  });

  it("asks for a bounded read and surfaces the refusal as the fixed limit message", async () => {
    const harness = createCapRunHarness({
      evidenceSnapshot: {
        evidenceId: testId(40),
        caseId: testCaseId(10),
        kind: "file",
        text: "x",
        uri: "s3://test/huge.bin",
        packedAt,
        packerVersion: 1,
      },
    });
    const limits: (ArtifactReadLimit | undefined)[] = [];
    await expect(
      runCap(
        fileAnalyze.run({
          ...harness.ctx,
          input: { evidenceId: testId(40) },
          readArtifact: (_uri, limit) => {
            limits.push(limit);
            return Effect.fail(
              new ValidationVendorError({ message: limit?.reason ?? "" })
            );
          },
        })
      )
    ).rejects.toThrow(/File input exceeds the 64 MiB analysis limit/);
    expect(limits).toEqual([
      {
        maxBytes: FILE_MAX_INPUT_BYTES,
        reason: "File input exceeds the 64 MiB analysis limit",
      },
    ]);
  });
});
