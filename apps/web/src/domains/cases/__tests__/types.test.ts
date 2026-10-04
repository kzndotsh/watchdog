import { describe, expect, it } from "vitest";

import { setActiveCaseIdInputSchema } from "@/domains/cases/types";
import {
  deleteCaseInputSchema,
  updateCaseInputSchema,
} from "@watchdog/schemas";

const CASE_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("case input schemas", () => {
  it("normalizes empty active case ids to null", () => {
    expect(setActiveCaseIdInputSchema.parse({ caseId: "" }).caseId).toBeNull();
    expect(
      setActiveCaseIdInputSchema.parse({ caseId: null }).caseId
    ).toBeNull();
    expect(setActiveCaseIdInputSchema.parse({ caseId: CASE_ID }).caseId).toBe(
      CASE_ID
    );
  });

  it("rejects invalid active case ids", () => {
    expect(
      setActiveCaseIdInputSchema.safeParse({ caseId: "case-1" }).success
    ).toBe(false);
  });

  it("parses delete case input", () => {
    expect(deleteCaseInputSchema.parse({ caseId: CASE_ID }).caseId).toBe(
      CASE_ID
    );
  });

  it("parses partial update case input", () => {
    expect(
      updateCaseInputSchema.parse({
        caseId: CASE_ID,
        allowThirdPartyEgress: true,
      }).allowThirdPartyEgress
    ).toBe(true);
  });

  it("rejects empty update case input", () => {
    expect(updateCaseInputSchema.safeParse({ caseId: CASE_ID }).success).toBe(
      false
    );
  });

  it("clears description when an empty string is sent", () => {
    expect(
      updateCaseInputSchema.parse({
        caseId: CASE_ID,
        description: "",
      }).description
    ).toBeNull();
  });
});
