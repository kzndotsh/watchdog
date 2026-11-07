import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { CONFIRMED_REQUIRES_EVIDENCE } from "@watchdog/policy";
import { CONFIDENCE_TIERS } from "@watchdog/schemas/shared";
import { testCaseId, untrustedCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

import { runDomain } from "../../infra/run-domain";
import { InvalidError } from "../../infra/tagged-errors";
import {
  assertConfidenceEvidenceEffect,
  assertEvidenceIdsInCaseEffect,
  parseGraphEvidenceIdsEffect,
} from "../graph-evidence";

const listIdsInCase = vi.fn();

vi.mock("@watchdog/db", () => ({
  acquirePool: () => ({ db: {} }),
  evidenceRepo: {
    listIdsInCase: (...args: unknown[]) => listIdsInCase(...args),
  },
}));

describe("assertEvidenceIdsInCaseEffect", () => {
  it("rejects invalid case ids before querying", async () => {
    await expect(
      runDomain(
        assertEvidenceIdsInCaseEffect(untrustedCaseId("not-a-uuid"), [
          testId(1),
        ])
      )
    ).rejects.toMatchObject({
      _tag: "NotFoundError",
      code: "not_found",
      entity: "Case",
    });

    expect(listIdsInCase).not.toHaveBeenCalled();
  });

  it("rejects invalid evidence ids before querying", async () => {
    const caseId = testCaseId(1);
    const evidenceId = testId(2);

    await expect(
      runDomain(
        assertEvidenceIdsInCaseEffect(caseId, [evidenceId, "not-a-uuid"])
      )
    ).rejects.toMatchObject({
      _tag: "InvalidError",
      reason: "One or more Evidence ids are invalid",
    });

    expect(listIdsInCase).not.toHaveBeenCalled();
  });

  it("rejects evidence ids missing from the case", async () => {
    const caseId = testCaseId(7);
    const evidenceId = testId(8);
    listIdsInCase.mockResolvedValueOnce([]);

    await expect(
      runDomain(assertEvidenceIdsInCaseEffect(caseId, [evidenceId]))
    ).rejects.toMatchObject({
      _tag: "InvalidError",
      reason: "One or more Evidence ids are missing or not in this Case",
    });
  });

  it("accepts padded canonical evidence ids", async () => {
    const caseId = testCaseId(3);
    const evidenceId = testId(4);
    listIdsInCase.mockResolvedValueOnce([{ id: evidenceId }]);

    await runDomain(
      assertEvidenceIdsInCaseEffect(caseId, [`  ${evidenceId}  `])
    );

    expect(listIdsInCase).toHaveBeenCalledWith({}, caseId, [evidenceId]);
  });
});

describe("parseGraphEvidenceIdsEffect", () => {
  it("rejects invalid evidence ids", async () => {
    const evidenceId = testId(5);
    await expect(
      Effect.runPromise(parseGraphEvidenceIdsEffect([evidenceId, "not-a-uuid"]))
    ).rejects.toMatchObject({
      _tag: "InvalidError",
      reason: "One or more Evidence ids are invalid",
    });
  });

  it("accepts padded canonical evidence ids", async () => {
    const evidenceId = testId(6);
    const parsed = await Effect.runPromise(
      parseGraphEvidenceIdsEffect([`  ${evidenceId}  `])
    );
    expect(parsed).toEqual([evidenceId]);
  });
});

describe("assertConfidenceEvidenceEffect", () => {
  it("refuses confirmed without Evidence as an InvalidError carrying the policy message", async () => {
    const failure = await Effect.runPromise(
      Effect.flip(assertConfidenceEvidenceEffect("confirmed", []))
    );
    expect(failure).toBeInstanceOf(InvalidError);
    expect(failure.message).toBe(CONFIRMED_REQUIRES_EVIDENCE);
  });

  it("counts every id: one is enough, more are fine", async () => {
    await expect(
      Effect.runPromise(
        assertConfidenceEvidenceEffect("confirmed", [testId(1)])
      )
    ).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(
        assertConfidenceEvidenceEffect("confirmed", [testId(1), testId(2)])
      )
    ).resolves.toBeUndefined();
  });

  it("never asks a lower tier for Evidence", async () => {
    for (const confidence of CONFIDENCE_TIERS) {
      if (confidence === "confirmed") continue;
      // oxlint-disable-next-line eslint/no-await-in-loop -- one tier at a time names the failing tier
      await expect(
        Effect.runPromise(assertConfidenceEvidenceEffect(confidence, []))
      ).resolves.toBeUndefined();
    }
  });
});
