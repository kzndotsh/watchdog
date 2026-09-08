import { describe, expect, it } from "vitest";

import {
  createCaseInputSchema,
  deleteCaseInputSchema,
  setActiveCaseIdInputSchema,
  updateCaseInputSchema,
} from "@/domains/cases/types";

const CASE_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("case input schemas", () => {
  it("slugifies create input when slug is omitted", () => {
    const parsed = createCaseInputSchema.parse({
      name: "Alpha Case",
    });
    expect(parsed.slug).toBe("alpha-case");
  });

  it("normalizes an explicit create slug", () => {
    expect(
      createCaseInputSchema.parse({
        name: "Alpha Case",
        slug: "  Alpha Corp  ",
      }).slug
    ).toBe("alpha-corp");
  });

  it("rejects invalid explicit create slugs", () => {
    expect(() =>
      createCaseInputSchema.parse({ name: "Alpha Case", slug: "!!!" })
    ).toThrow();
  });

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
