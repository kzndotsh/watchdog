import { describe, expect, it } from "vitest";

import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { testId } from "@watchdog/test-kit";

import { orgCaseFilter } from "../_org-case-filter";

describe("orgCaseFilter", () => {
  it("returns org-only filter when caseId is omitted", () => {
    const filter = orgCaseFilter(TEST_ORGANIZATION_ID, undefined, {
      name: "id",
    } as never);
    expect(filter).toBeDefined();
  });

  it("rejects blank or invalid case ids", () => {
    const column = { name: "id" } as never;
    expect(orgCaseFilter(TEST_ORGANIZATION_ID, "   ", column)).toBeDefined();
    expect(orgCaseFilter(TEST_ORGANIZATION_ID, "case-1", column)).toBeDefined();
  });

  it("accepts padded canonical UUIDs", () => {
    const caseId = testId(10);
    const filter = orgCaseFilter(TEST_ORGANIZATION_ID, `  ${caseId}  `, {
      name: "id",
    } as never);
    expect(filter).toBeDefined();
  });
});
