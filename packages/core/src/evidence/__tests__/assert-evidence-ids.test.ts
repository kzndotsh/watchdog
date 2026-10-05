import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { testCaseId, testId, untrustedCaseId } from "@watchdog/test-kit";

import { runDomain } from "../../infra/run-domain";
import {
  assertEvidenceIdsInCaseEffect,
  parseGraphEvidenceIdsEffect,
} from "../evidence";

const listIdsInCase = vi.fn();

vi.mock("@watchdog/db", () => ({
  db: {},
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
      _tag: "InvalidError",
      reason: "Case not found",
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
