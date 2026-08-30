import { describe, expect, it } from "vitest";

import { CASE_NAV_ITEMS, NAV_GROUPS, pathActive } from "@/config/nav";

describe("nav config", () => {
  it("marks nested routes active for their nav target", () => {
    expect(pathActive("/entities/person-1", "/entities")).toBe(true);
    expect(pathActive("/settings/credentials", "/settings")).toBe(true);
    expect(pathActive("/collect", "/triage")).toBe(false);
  });

  it("exposes case and workspace nav groups", () => {
    expect(CASE_NAV_ITEMS.map((item) => item.to)).toEqual([
      "/entities",
      "/identifiers",
      "/graph",
    ]);
    expect(
      NAV_GROUPS.flatMap((group) => group.items.map((item) => item.to))
    ).toContain("/tasks");
  });
});
