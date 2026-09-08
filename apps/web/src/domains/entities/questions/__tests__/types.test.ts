import { describe, expect, it } from "vitest";

import {
  createQuestionInputSchema,
  resolveQuestionInputSchema,
  updateQuestionInputSchema,
} from "@/domains/entities/questions/types";
import { testId } from "@watchdog/test-kit";

describe("questions types schemas", () => {
  it("parses create and resolve question payloads", () => {
    expect(
      createQuestionInputSchema.parse({
        caseId: testId(10),
        entityId: testId(20),
        text: " Who owns the domain? ",
      }).text
    ).toBe("Who owns the domain?");

    expect(
      resolveQuestionInputSchema.parse({
        caseId: testId(10),
        questionId: testId(1),
        resolvedNote: " Found in WHOIS ",
      }).resolvedNote
    ).toBe("Found in WHOIS");
  });

  it("allows resolvedNote-only null to clear a resolved note", () => {
    expect(
      updateQuestionInputSchema.safeParse({
        caseId: testId(10),
        questionId: testId(1),
        resolvedNote: null,
      }).success
    ).toBe(true);
  });

  it("rejects empty question update input", () => {
    expect(
      updateQuestionInputSchema.safeParse({
        caseId: testId(10),
        questionId: testId(1),
      }).success
    ).toBe(false);
  });
});
