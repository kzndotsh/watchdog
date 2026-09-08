import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import { parseSseCaseIdParam, normalizeSseCaseId } from "../activity";

describe("parseSseCaseIdParam", () => {
  it("returns null caseId when param is absent", () => {
    expect(parseSseCaseIdParam(null)).toEqual({
      ok: true,
      value: { caseId: null },
    });
  });

  it("rejects whitespace-only param", () => {
    expect(parseSseCaseIdParam("   ")).toEqual({ ok: false });
  });

  it("rejects invalid uuid", () => {
    expect(parseSseCaseIdParam("not-a-uuid")).toEqual({ ok: false });
  });

  it("trims and accepts valid uuid", () => {
    const caseId = testId(11);
    expect(parseSseCaseIdParam(`  ${caseId}  `)).toEqual({
      ok: true,
      value: { caseId },
    });
  });
});

describe("normalizeSseCaseId", () => {
  it("returns undefined for invalid ids", () => {
    expect(normalizeSseCaseId("not-a-uuid")).toBeUndefined();
    expect(normalizeSseCaseId("   ")).toBeUndefined();
  });

  it("trims and accepts valid uuid", () => {
    const caseId = testId(12);
    expect(normalizeSseCaseId(`  ${caseId}  `)).toBe(caseId);
  });
});
