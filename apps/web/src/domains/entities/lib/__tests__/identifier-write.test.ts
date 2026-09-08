import { describe, expect, it } from "vitest";

import {
  buildCreateIdentifierData,
  buildUpdateIdentifierData,
} from "@/domains/entities/lib/identifier-write";
import { testId } from "@watchdog/test-kit";

describe("buildCreateIdentifierData", () => {
  it("trims value and normalizes evidence ids", () => {
    const caseId = testId(10);
    const entityId = testId(11);
    const evidenceId = testId(12);
    const parsed = buildCreateIdentifierData(caseId, {
      entityId,
      type: "email",
      value: "  user@example.com  ",
      confidence: "unverified",
      evidenceIds: [`  ${evidenceId}  `],
    });
    expect(parsed).toEqual({
      caseId,
      entityId,
      type: "email",
      value: "user@example.com",
      confidence: "unverified",
      status: "unknown",
      evidenceIds: [evidenceId],
    });
  });
});

describe("buildUpdateIdentifierData", () => {
  it("trims value and normalizes evidence ids", () => {
    const caseId = testId(10);
    const identifierId = testId(11);
    const evidenceId = testId(12);
    const parsed = buildUpdateIdentifierData(caseId, {
      identifierId,
      value: "  user@example.com  ",
      evidenceIds: [`  ${evidenceId}  `],
    });
    expect(parsed).toEqual({
      caseId,
      identifierId,
      value: "user@example.com",
      evidenceIds: [evidenceId],
    });
  });

  it("clears notes when an empty string is sent", () => {
    const caseId = testId(10);
    const identifierId = testId(11);
    expect(
      buildUpdateIdentifierData(caseId, {
        identifierId,
        notes: "",
      }).notes
    ).toBeNull();
  });
});
