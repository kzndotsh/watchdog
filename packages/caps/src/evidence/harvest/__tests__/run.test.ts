import { describe, expect, it } from "vitest";

import { parseJsonValue, REPORT_JSON_ARTIFACT } from "@watchdog/schemas";
import { createCapRunHarness, runCap, testId } from "@watchdog/test-kit";

import { harvest } from "../cap.ts";

describe("evidence.harvest run", () => {
  it("uploads report.json from a snapshot with an email", async () => {
    const harness = createCapRunHarness({
      evidenceSnapshot: {
        evidenceId: testId(40),
        caseId: testId(10),
        kind: "attestation",
        text: "Contact ada@mailhost.test",
        packedAt: "2026-01-01T00:00:00.000Z",
        packerVersion: 1,
      },
    });
    const result = await runCap(
      harvest.run({
        ...harness.ctx,
        input: { evidenceId: testId(40) },
      })
    );
    expect(
      result.artifacts.some((row) => row.name === REPORT_JSON_ARTIFACT)
    ).toBe(true);
    const report = harness.artifacts.find(
      (row) => row.name === REPORT_JSON_ARTIFACT
    );
    expect(report).toBeDefined();
    if (report === undefined) {
      throw new TypeError("expected report.json");
    }
    const parsed = parseJsonValue(new TextDecoder().decode(report.bytes));
    expect(JSON.stringify(parsed)).toContain("ada@mailhost.test");
  });

  it("throws when the snapshot is missing", async () => {
    const harness = createCapRunHarness();
    await expect(
      runCap(
        harvest.run({
          ...harness.ctx,
          input: { evidenceId: testId(40) },
        })
      )
    ).rejects.toThrow(/EvidenceSnapshot missing/);
  });
});
