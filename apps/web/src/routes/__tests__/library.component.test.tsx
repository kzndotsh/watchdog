import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
    getRouteApi: () => ({}),
  };
});

import { librarySearchSchema } from "@/domains/library/lib/library-search";
import { Route } from "@/routes/_protected/library";

describe("library route search", () => {
  it("validates with the Library's search schema, so a bare /library is valid", () => {
    expect(Route.options.validateSearch).toBe(librarySearchSchema);
    const search = librarySearchSchema.parse({});
    expect(search.q).toBeUndefined();
    expect(search.cat).toBeUndefined();
    expect(search.readiness).toBeUndefined();
  });

  it("keeps the filters and drops junk", () => {
    expect(
      librarySearchSchema.parse({
        q: " shodan ",
        kind: ["email"],
        cat: "network",
        readiness: ["ready"],
        thirdParty: true,
        commercialUse: ["allowed"],
      })
    ).toMatchObject({
      q: "shodan",
      kind: ["email"],
      cat: "network",
      readiness: ["ready"],
      thirdParty: true,
      commercialUse: ["allowed"],
    });
    // One unknown value drops its whole param, as for every list route.
    expect(
      librarySearchSchema.parse({ readiness: ["ready", "bogus"] })
    ).toEqual({});
    const junk = librarySearchSchema.parse({
      q: 5,
      readiness: "ready",
      thirdParty: "no",
      commercialUse: [],
    });
    expect(junk.q).toBeUndefined();
    expect(junk.readiness).toBeUndefined();
    expect(junk.thirdParty).toBeUndefined();
    expect(junk.commercialUse).toEqual([]);
  });
});

describe("library route", () => {
  it("has no redirect and no `id` search key: an old ?id=cap:x link is an ordinary Library URL", () => {
    expect(Route.options.beforeLoad).toBeUndefined();
    expect(librarySearchSchema.parse({ id: "cap:network.dns.lookup" })).toEqual(
      {}
    );
  });
});
