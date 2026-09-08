import { describe, expect, it } from "vitest";

import { testId } from "@watchdog/test-kit";

import { orgCaseFilter } from "../_org-case-filter";

describe("orgCaseFilter", () => {
  it("returns org-only filter when caseId is omitted", () => {
    const filter = orgCaseFilter("org-1", undefined, { name: "id" } as never);
    expect(filter).toBeDefined();
  });

  it("rejects blank or invalid case ids", () => {
    const column = { name: "id" } as never;
    expect(orgCaseFilter("org-1", "   ", column)).toBeDefined();
    expect(orgCaseFilter("org-1", "case-1", column)).toBeDefined();
  });

  it("accepts padded canonical UUIDs", () => {
    const caseId = testId(10);
    const filter = orgCaseFilter("org-1", `  ${caseId}  `, {
      name: "id",
    } as never);
    expect(filter).toBeDefined();
  });
});
