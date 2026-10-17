import { describe, expect, it } from "vitest";

import {
  CASE_NAV_ITEMS,
  NAV_GROUPS,
  pathActive,
  workHref,
  workPathActive,
} from "@/config/nav";

describe("nav config", () => {
  it("marks nested routes active for their nav target", () => {
    expect(pathActive("/settings/credentials", "/settings")).toBe(true);
    expect(pathActive("/cases", "/settings")).toBe(false);
  });

  it("marks a Work screen active for any Case, and below the screen", () => {
    expect(workPathActive("/cases/alpha/entities", "entities")).toBe(true);
    expect(workPathActive("/cases/beta/entities/ada", "entities")).toBe(true);
    expect(workPathActive("/cases/alpha/collect", "triage")).toBe(false);
    expect(workPathActive("/cases/alpha", "entities")).toBe(false);
    expect(workPathActive("/entities", "entities")).toBe(false);
  });

  it("exposes case and workspace nav groups", () => {
    expect(CASE_NAV_ITEMS.map((item) => item.screen)).toEqual([
      "entities",
      "identifiers",
      "graph",
    ]);
    const work = NAV_GROUPS.flatMap((group) =>
      group.kind === "work" ? group.items.map((item) => item.screen) : []
    );
    expect(work).toContain("tasks");
  });

  it("puts the Case slug in a Work link, and falls back to Cases without one", () => {
    expect(workHref("collect", "alpha")).toEqual({
      to: "/cases/$caseSlug/collect",
      params: { caseSlug: "alpha" },
    });
    expect(workHref("collect", undefined)).toEqual({ to: "/cases" });
  });
});
