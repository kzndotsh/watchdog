import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import { validateEdgeUpdateEffect } from "../edge-update";

describe("validateEdgeUpdateEffect", () => {
  const caseId = testId(1);
  const edgeId = testId(2);
  const fromId = testId(10);
  const toId = testId(20);

  const existing = {
    id: edgeId,
    caseId,
    fromId,
    toId,
    predicate: "associated_with" as const,
    confidence: "unverified" as const,
    notes: null,
  };

  it("rejects invalid fromId UUIDs", async () => {
    await expect(
      Effect.runPromise(
        validateEdgeUpdateEffect(
          {
            caseId,
            organizationId: testId(99),
            edgeId,
            fromId: "not-a-uuid",
            toId,
          },
          existing,
          []
        )
      )
    ).rejects.toMatchObject({
      _tag: "InvalidError",
      reason: "fromId must be a valid UUID",
    });
  });

  it("rejects invalid toId UUIDs", async () => {
    await expect(
      Effect.runPromise(
        validateEdgeUpdateEffect(
          {
            caseId,
            organizationId: testId(99),
            edgeId,
            fromId,
            toId: "not-a-uuid",
          },
          existing,
          []
        )
      )
    ).rejects.toMatchObject({
      _tag: "InvalidError",
      reason: "toId must be a valid UUID",
    });
  });

  it("rejects invalid viewEntityId UUIDs", async () => {
    await expect(
      Effect.runPromise(
        validateEdgeUpdateEffect(
          {
            caseId,
            organizationId: testId(99),
            edgeId,
            viewEntityId: "not-a-uuid",
          },
          existing,
          []
        )
      )
    ).rejects.toMatchObject({
      _tag: "InvalidError",
      reason: "viewEntityId must be a valid UUID",
    });
  });
});
