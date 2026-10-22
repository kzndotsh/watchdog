import { describe, it, expect } from "vitest";

import {
  buildPageTrail,
  type PageTrailInput,
  type TrailItem,
} from "../page-trail.ts";

const CASE = { name: "Boy Moment", slug: "boy-moment" };
const ENTITY = { name: "Ada", slug: "ada" };

const BASE_TRAIL_INPUT = {
  routeCase: CASE,
  entity: null,
  libraryEntry: null,
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

  it("case overview falls back to slug before the Case loads", () => {
    const items = buildPageTrail({
      ...BASE_TRAIL_INPUT,
      pathname: "/cases/boy-moment",
      routeCase: null,
    });
    expect(labels(items)).toEqual(["Cases", "boy-moment"]);
  });

  it("Work screens prefix the Case from the URL, linking to Overview", () => {
    for (const screen of [
      ["entities", "Entities"],
      ["identifiers", "Identifiers"],
      ["graph", "Graph"],
      ["collect", "Collect"],
      ["triage", "Triage"],
      ["tasks", "Tasks"],
    ] as const) {
      const [segment, label] = screen;
      const items = buildPageTrail({
        ...BASE_TRAIL_INPUT,
        pathname: `/cases/boy-moment/${segment}`,
      });
      expect(labels(items), segment).toEqual(["Boy Moment", label]);
      expect(items[0]?.id, segment).toBe("case");
      expect(hrefTos(items), segment).toEqual(["/cases/$caseSlug", undefined]);
      const href = items[0]?.href;
      expect(href && "params" in href ? href.params.caseSlug : "").toBe(
        "boy-moment"
      );
    }
  });

  it("a Work screen shows the slug before the Case resolves", () => {
    const items = buildPageTrail({
      ...BASE_TRAIL_INPUT,
      routeCase: null,
      pathname: "/cases/boy-moment/tasks",
    });
    expect(labels(items)).toEqual(["boy-moment", "Tasks"]);
  });

  it("dossier is Case / Entities / name", () => {
    const items = buildPageTrail({
      ...BASE_TRAIL_INPUT,
      pathname: "/cases/boy-moment/entities/ada",
      entity: ENTITY,
    });
    expect(labels(items)).toEqual(["Boy Moment", "Entities", "Ada"]);
    expect(hrefTos(items)).toEqual([
      "/cases/$caseSlug",
      "/cases/$caseSlug/entities",
      undefined,
    ]);
    const entities = items[1]?.href;
    expect(
      entities && "params" in entities ? entities.params.caseSlug : ""
    ).toBe("boy-moment");
  });

  it("dossier falls back to slug before entity loads", () => {
    const items = buildPageTrail({
      ...BASE_TRAIL_INPUT,
      pathname: "/cases/boy-moment/entities/ada",
    });
    expect(labels(items)).toEqual(["Boy Moment", "Entities", "ada"]);
  });

  it("dossier falls back to slug when entity name is blank", () => {
    const items = buildPageTrail({
      ...BASE_TRAIL_INPUT,
      pathname: "/cases/boy-moment/entities/acme-corp",
      entity: { name: "", slug: "acme-corp" },
    });
    expect(labels(items)).toEqual(["Boy Moment", "Entities", "acme-corp"]);
  });

  it("settings and style guide omit Case", () => {
    expect(
      labels(buildPageTrail({ ...BASE_TRAIL_INPUT, pathname: "/settings" }))
    ).toEqual(["Settings"]);
    expect(
      labels(buildPageTrail({ ...BASE_TRAIL_INPUT, pathname: "/ui" }))
    ).toEqual(["Style guide"]);
  });

  it("the Library is a Case-less page of its own", () => {
    expect(
      labels(buildPageTrail({ ...BASE_TRAIL_INPUT, pathname: "/library" }))
    ).toEqual(["Library"]);
  });

  it("an entry's page sits under the Library, with a link back", () => {
    const items = buildPageTrail({
      ...BASE_TRAIL_INPUT,
      pathname: "/library/caps/network.shodan.lookup",
      libraryEntry: { title: "Shodan lookup" },
    });
    expect(labels(items)).toEqual(["Library", "Network", "Shodan lookup"]);
    expect(items[0]?.href).toEqual({ to: "/library" });
    expect(items[1]?.href).toEqual({
      to: "/library",
      search: { cat: "network" },
    });
    expect(items[2]?.href).toBeUndefined();
  });

  it("an entry's crumb is its id until the catalog loads", () => {
    expect(
      labels(
        buildPageTrail({
          ...BASE_TRAIL_INPUT,
          pathname: "/library/playbooks/email-identity",
        })
      )
    ).toEqual(["Library", "Playbooks", "email-identity"]);
  });

  it("Deleted Cases sits under Cases, with a link back", () => {
    const items = buildPageTrail({
      ...BASE_TRAIL_INPUT,
      pathname: "/deleted-cases",
    });
    expect(labels(items)).toEqual(["Cases", "Deleted Cases"]);
    expect(items[0]?.href).toEqual({ to: "/cases" });
    expect(items[1]?.href).toBeUndefined();
  });
});
