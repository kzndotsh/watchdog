import { describe, expect, it } from "vitest";

import { buildUpdateCaseData } from "@/domains/cases/lib/case-write";
import { testId } from "@watchdog/test-kit";

describe("buildUpdateCaseData", () => {
  it("trims name and clears blank description", () => {
    const caseId = testId(10);
    const parsed = buildUpdateCaseData(caseId, {
      name: "  Renamed  ",
      description: "   ",
    });
    expect(parsed.caseId).toBe(caseId);
    expect(parsed.name).toBe("Renamed");
    expect(parsed.description).toBeNull();
  });

  it("passes through allowThirdPartyEgress", () => {
    const caseId = testId(10);
    const parsed = buildUpdateCaseData(caseId, {
      allowThirdPartyEgress: true,
    });
    expect(parsed.allowThirdPartyEgress).toBe(true);
  });
});
