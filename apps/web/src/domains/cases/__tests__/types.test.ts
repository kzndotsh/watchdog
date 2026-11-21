import { describe, expect, it } from "vitest";

import {
  deleteCaseInputSchema,
  updateCaseInputSchema,
} from "@watchdog/schemas/cases";

const CASE_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("case input schemas", () => {
  it("parses delete case input", () => {
    expect(deleteCaseInputSchema.parse({ caseId: CASE_ID }).caseId).toBe(
      CASE_ID
    );
  });

  it("parses partial update case input", () => {
    expect(
      updateCaseInputSchema.parse({
        caseId: CASE_ID,
        allowedEgress: [
          "local",
          "target",
          "public_lookup",
          "account_lookup",
          "model",
        ],
      }).allowedEgress
    ).toEqual(["local", "target", "public_lookup", "account_lookup", "model"]);
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
