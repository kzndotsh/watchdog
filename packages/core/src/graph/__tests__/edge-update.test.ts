import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { TEST_ORGANIZATION_ID, testCaseId } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

import { validateEdgeUpdateEffect } from "../edge-update";

describe("validateEdgeUpdateEffect", () => {
  const caseId = testCaseId(1);
  const edgeId = testId(2);
  const fromId = testId(10);
  const toId = testId(20);

  const existing = {
    id: edgeId,
    caseId,
    fromId,
    toId,
    predicate: "associate_of" as const,
    confidence: "unverified" as const,
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    createdBy: null,
    updatedBy: null,
    version: 1,
  };

  it("rejects invalid fromId UUIDs", async () => {
    await expect(
      Effect.runPromise(
        validateEdgeUpdateEffect(
          {
            caseId,
            organizationId: TEST_ORGANIZATION_ID,
            edgeId,
            expectedVersion: 1,
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
            organizationId: TEST_ORGANIZATION_ID,
            edgeId,
            expectedVersion: 1,
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
            organizationId: TEST_ORGANIZATION_ID,
            edgeId,
            expectedVersion: 1,
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
