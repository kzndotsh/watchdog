import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import {
  asCaseId,
  asOrganizationId,
  caseIdSchema,
  organizationIdSchema,
  trimmedCaseIdSchema,
} from "../ids";
import { parseTrimmedCaseId, parseTrimmedUuid } from "../primitives";

describe("branded ids", () => {
  it("asOrganizationId accepts any non-empty opaque text id", () => {
    expect(asOrganizationId("org_Abc123")).toBe("org_Abc123");
    expect(() => asOrganizationId("")).toThrow();
  });

  it("asCaseId accepts uuids only", () => {
    expect(asCaseId(testId(1))).toBe(testId(1));
    expect(() => asCaseId("case-1")).toThrow();
    expect(() => asCaseId(` ${testId(1)} `)).toThrow();
  });

  it("schemas parse to the same values", () => {
    expect(caseIdSchema.parse(testId(2))).toBe(testId(2));
    expect(organizationIdSchema.safeParse("").success).toBe(false);
  });

  it("trimmedCaseIdSchema and parseTrimmedCaseId keep the trimming behaviour", () => {
    expect(trimmedCaseIdSchema.parse(`  ${testId(3)}  `)).toBe(testId(3));
    expect(parseTrimmedCaseId(`  ${testId(3)}  `)).toBe(testId(3));
    expect(parseTrimmedCaseId("nope")).toBeNull();
    expect(parseTrimmedUuid(`  ${testId(3)}  `)).toBe(testId(3));
    expect(parseTrimmedUuid("nope")).toBeNull();
  });
});
