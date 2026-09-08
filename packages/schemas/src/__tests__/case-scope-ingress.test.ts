import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  deleteCaseInputSchema,
  getCaseBySlugInputSchema,
  updateCaseInputSchema,
} from "../case-update";
import { deleteCredentialInputSchema } from "../credential-put";
import {
  entityScopeInputSchema,
  entitySlugScopeInputSchema,
  questionScopeInputSchema,
} from "../graph-scope";
import { resolveQuestionInputSchema } from "../question-resolve";

describe("updateCaseInputSchema", () => {
  it("rejects empty patches", () => {
    expect(updateCaseInputSchema.safeParse({ caseId: testId(0) }).success).toBe(
      false
    );
  });

  it("clears description on empty string", () => {
    expect(
      updateCaseInputSchema.parse({
        caseId: testId(0),
        description: "   ",
      }).description
    ).toBeNull();
  });
});

describe("deleteCaseInputSchema", () => {
  it("normalizes padded case ids", () => {
    const caseId = testId(0);
    expect(
      deleteCaseInputSchema.parse({ caseId: `  ${caseId}  ` }).caseId
    ).toBe(caseId);
  });
});

describe("getCaseBySlugInputSchema", () => {
  it("slugifies padded case slugs", () => {
    expect(
      getCaseBySlugInputSchema.parse({ caseSlug: "  Alpha Corp  " }).caseSlug
    ).toBe("alpha-corp");
  });
});

describe("deleteCredentialInputSchema", () => {
  it("rejects blank credential names", () => {
    expect(deleteCredentialInputSchema.safeParse({ name: "   " }).success).toBe(
      false
    );
  });
});

describe("resolveQuestionInputSchema", () => {
  it("trims resolved note", () => {
    expect(
      resolveQuestionInputSchema.parse({
        caseId: testId(0),
        questionId: testId(1),
        resolvedNote: "  answered  ",
      }).resolvedNote
    ).toBe("answered");
  });
});

describe("graph scope schemas", () => {
  it("normalize padded ids", () => {
    const caseId = testId(0);
    const entityId = testId(1);
    expect(
      entityScopeInputSchema.parse({
        caseId: `  ${caseId}  `,
        entityId: `  ${entityId}  `,
      })
    ).toEqual({ caseId, entityId });
    expect(
      questionScopeInputSchema.parse({
        caseId,
        questionId: testId(2),
      }).caseId
    ).toBe(caseId);
  });

  it("slugifies entity slug scope", () => {
    expect(
      entitySlugScopeInputSchema.parse({
        caseId: testId(0),
        slug: "  Alpha Corp  ",
      }).slug
    ).toBe("alpha-corp");
  });
});
