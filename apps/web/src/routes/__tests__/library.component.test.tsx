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
    expect(search.status).toBeUndefined();
  });

  it("keeps the filters and drops junk", () => {
    expect(
      librarySearchSchema.parse({
        q: " shodan ",
        kind: "email",
        cat: "network",
        status: ["ready", "bogus"],
        third: true,
        use: ["allowed"],
      })
    ).toMatchObject({
      q: "shodan",
      kind: "email",
      cat: "network",
      status: ["ready"],
      third: true,
      use: ["allowed"],
    });
    expect(
      librarySearchSchema.parse({
        q: 5,
        status: "ready",
        third: "no",
        use: [],
      })
    ).toMatchObject({
      q: undefined,
      status: undefined,
      third: undefined,
      use: undefined,
    });
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
