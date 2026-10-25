import { describe, expect, it } from "vitest";

import { FIRST_CASE_PATH, firstCaseGateApplies } from "@/auth/first-case-gate";

describe("firstCaseGateApplies", () => {
  it.each([
    "/",
    "/cases",
    "/cases/alpha",
    "/cases/alpha/tasks",
    "/cases/alpha/collect",
    "/cases/alpha/triage",
    "/settingsx",
    "/librarian",
  ])("applies to %s", (pathname) => {
    expect(firstCaseGateApplies(pathname)).toBe(true);
  });

  it.each([
    "/settings",
    "/settings/organization",
    "/library",
    "/library/caps/some-cap",
    "/library/playbooks/some-playbook",
    "/deleted-cases",
    "/ui",
  ])("exempts %s", (pathname) => {
    expect(firstCaseGateApplies(pathname)).toBe(false);
  });

  it("names the step route", () => {
    expect(FIRST_CASE_PATH).toBe("/onboarding/case");
  });
});
