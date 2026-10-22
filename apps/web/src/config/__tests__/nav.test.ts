import { describe, expect, it } from "vitest";

import { CASE_NAV_ITEMS, NAV_GROUPS, pathActive, workHref } from "@/config/nav";

describe("nav config", () => {
  it("marks nested routes active for their nav target", () => {
    expect(pathActive("/settings/credentials", "/settings")).toBe(true);
    expect(pathActive("/cases", "/settings")).toBe(false);
  });

  it("marks Cases active on the Cases list only, not on a Case's screens", () => {
    expect(pathActive("/cases", "/cases")).toBe(true);
    expect(pathActive("/cases/alpha", "/cases")).toBe(false);
    expect(pathActive("/cases/alpha/collect", "/cases")).toBe(false);
    expect(pathActive("/cases/alpha/entities/ada", "/cases")).toBe(false);
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

  it("lists the Library as a Case-less destination", () => {
    const destinations = NAV_GROUPS.flatMap((group) =>
      group.kind === "static" ? group.items.map((item) => item.to) : []
    );
    expect(destinations).toContain("/library");
    expect(pathActive("/library", "/library")).toBe(true);
    expect(pathActive("/cases", "/library")).toBe(false);
  });

  it("puts the Case slug in a Work link, and falls back to Cases without one", () => {
    expect(workHref("collect", "alpha")).toEqual({
      to: "/cases/$caseSlug/collect",
      params: { caseSlug: "alpha" },
    });
    expect(workHref("collect", undefined)).toEqual({ to: "/cases" });
  });
});
