import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { REPORT_JSON_ARTIFACT } from "@watchdog/schemas/jobs";
import { testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";
import { ValidationVendorError } from "@watchdog/tools/errors";

const { structuredExtractEffect } = vi.hoisted(() => ({
  structuredExtractEffect: vi.fn(),
}));

vi.mock("@watchdog/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/ai")>();
  return { ...actual, structuredExtractEffect };
});

import { createCapRunHarness, runCap } from "../../../testing";
import { extractAi } from "../cap.ts";

describe("evidence.extract.ai run", () => {
  it("skips the LLM when Evidence text is empty", async () => {
    const harness = createCapRunHarness({
      evidenceSnapshot: {
        evidenceId: testId(40),
        caseId: testCaseId(10),
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

  it("keeps model-provider error text out of the failure message", async () => {
    const upstream = "401 invalid x-api-key sk-ant-api03-LEAKED";
    structuredExtractEffect.mockReturnValueOnce(
      Effect.fail({ _tag: "InvalidOutputError", reason: upstream })
    );
    const harness = createCapRunHarness({
      secrets: { ANTHROPIC_API_KEY: "sk-test" },
      evidenceSnapshot: {
        evidenceId: testId(41),
        caseId: testCaseId(10),
        kind: "attestation",
        text: "some held text",
        packedAt: "2026-01-01T00:00:00.000Z",
        packerVersion: 1,
      },
    });
    const failure: unknown = await runCap(
      extractAi.run({ ...harness.ctx, input: { evidenceId: testId(41) } })
    ).then(
      () => undefined,
      (error: unknown) => error
    );
    if (!(failure instanceof ValidationVendorError)) {
      expect.unreachable("expected ValidationVendorError");
    }
    expect(failure.message).not.toMatch(/sk-ant|x-api-key|401/);
    expect(failure).toMatchObject({ cause: upstream });
  });
});
