import { describe, expect, it } from "vitest";

import { REPORT_JSON_ARTIFACT } from "@watchdog/schemas";
import { createCapRunHarness, runCap, testId } from "@watchdog/test-kit";

import { extractAi } from "../cap.ts";

describe("evidence.extract.ai run", () => {
  it("skips the LLM when Evidence text is empty", async () => {
    const harness = createCapRunHarness({
      evidenceSnapshot: {
        evidenceId: testId(40),
        caseId: testId(10),
        kind: "attestation",
        text: "   ",
        packedAt: "2026-01-01T00:00:00.000Z",
        packerVersion: 1,
      },
    });
    const result = await runCap(
      extractAi.run({
        ...harness.ctx,
        input: { evidenceId: testId(40) },
      })
    );
    expect(
      result.artifacts.some((row) => row.name === REPORT_JSON_ARTIFACT)
    ).toBe(true);
    expect(harness.credentialCalls).toEqual([]);
  });

  it("throws when the snapshot is missing", async () => {
    const harness = createCapRunHarness();
    await expect(
      runCap(
        extractAi.run({
          ...harness.ctx,
          input: { evidenceId: testId(40) },
        })
      )
    ).rejects.toThrow(/EvidenceSnapshot missing/);
  });
});
