import { describe, it, expect } from "vitest";

import {
  buildPageTrail,
  type PageTrailInput,
  type TrailItem,
} from "../page-trail.ts";

const CASE = { name: "Boy Moment", slug: "boy-moment" };
const ENTITY = { name: "Ada" };

const BASE_TRAIL_INPUT = {
  activeCase: CASE,
  routeCase: null,
  entity: null,
} satisfies Omit<PageTrailInput, "pathname">;

function labels(items: TrailItem[]): string[] {
  return items.map((item) => item.label);
}

function hrefTos(items: TrailItem[]): (string | undefined)[] {
  return items.map((item) => item.href?.to);
}

describe("buildPageTrail", () => {
  it("dashboard", () => {
    const items = buildPageTrail({ ...BASE_TRAIL_INPUT, pathname: "/" });
    expect(labels(items)).toEqual(["Dashboard"]);
    expect(items[0]?.href).toBe(undefined);
  });

  it("cases list", () => {
    expect(
      labels(buildPageTrail({ ...BASE_TRAIL_INPUT, pathname: "/cases" }))
    ).toEqual(["Cases"]);
  });

  it("case overview links Cases to the manage list", () => {
    const items = buildPageTrail({
      ...BASE_TRAIL_INPUT,
      pathname: "/cases/boy-moment",
      routeCase: CASE,
    });
    expect(labels(items)).toEqual(["Cases", "Boy Moment"]);
    expect(items[0]?.href?.to).toBe("/cases");
    expect(items[1]?.href).toBe(undefined);
  });

  it("case overview uses the route Case, not Active Case", () => {
    const items = buildPageTrail({
      ...BASE_TRAIL_INPUT,
      pathname: "/cases/other-slug",
      routeCase: { name: "Other", slug: "other-slug" },
    });
    expect(labels(items)).toEqual(["Cases", "Other"]);
  });

  it("case overview falls back to slug before the Case loads", () => {
    const items = buildPageTrail({
      ...BASE_TRAIL_INPUT,
      pathname: "/cases/boy-moment",
    });
    expect(labels(items)).toEqual(["Cases", "boy-moment"]);
  });

  it("case-scoped surfaces prefix Active Case → Overview", () => {
    for (const [path, label] of [
      ["/entities", "Entities"],
      ["/identifiers", "Identifiers"],
      ["/graph", "Graph"],
      ["/collect", "Collect"],
      ["/triage", "Triage"],
      ["/tasks", "Tasks"],
    ] as const) {
      const items = buildPageTrail({ ...BASE_TRAIL_INPUT, pathname: path });
      expect(labels(items), path).toEqual(["Boy Moment", label]);
      expect(items[0]?.id, path).toBe("case");
      expect(hrefTos(items), path).toEqual(["/cases/$caseSlug", undefined]);
      const href = items[0]?.href;
      expect(href && "params" in href ? href.params.caseSlug : "").toBe(
        "boy-moment"
      );
    }
  });

  it("dossier is Case / Entities / name", () => {
    const items = buildPageTrail({
      ...BASE_TRAIL_INPUT,
      pathname: "/entities/ada",
      entity: ENTITY,
    });
    expect(labels(items)).toEqual(["Boy Moment", "Entities", "Ada"]);
    expect(hrefTos(items)).toEqual([
      "/cases/$caseSlug",
      "/entities",
      undefined,
    ]);
  });

  it("dossier falls back to slug before entity loads", () => {
    const items = buildPageTrail({
      ...BASE_TRAIL_INPUT,
      pathname: "/entities/ada",
    });
    expect(labels(items)).toEqual(["Boy Moment", "Entities", "ada"]);
  });

  it("settings and style guide omit Case", () => {
    expect(
      labels(buildPageTrail({ ...BASE_TRAIL_INPUT, pathname: "/settings" }))
    ).toEqual(["Settings"]);
    expect(
      labels(buildPageTrail({ ...BASE_TRAIL_INPUT, pathname: "/ui" }))
    ).toEqual(["Style guide"]);
  });

  it("no Active Case omits the Case crumb", () => {
    const items = buildPageTrail({
      ...BASE_TRAIL_INPUT,
      activeCase: null,
      pathname: "/entities",
    });
    expect(labels(items)).toEqual(["Entities"]);
  });
});
