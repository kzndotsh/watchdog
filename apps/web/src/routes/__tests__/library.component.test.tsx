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

import {
  librarySearchSchema,
  redirectLegacyEntry,
} from "@/domains/library/lib/library-search";
import { Route } from "@/routes/_protected/library";

function redirectFor(id: string | undefined): unknown {
  try {
    redirectLegacyEntry(librarySearchSchema.parse({ id }));
  } catch (error) {
    return error;
  }
  return null;
}

describe("library route search", () => {
  it("validates with the Library's search schema, so a bare /library is valid", () => {
    expect(Route.options.validateSearch).toBe(librarySearchSchema);
    const search = librarySearchSchema.parse({});
    expect(search.id).toBeUndefined();
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

describe("library route redirect", () => {
  it("sends ?id=cap:<id> to the Cap's page", () => {
    expect(redirectFor("cap:network.dns.lookup")).toMatchObject({
      options: { href: "/library/caps/network.dns.lookup" },
    });
  });

  it("sends ?id=playbook:<id> to the Playbook's page", () => {
    expect(redirectFor("playbook:email-identity")).toMatchObject({
      options: { href: "/library/playbooks/email-identity" },
    });
  });

  it("does not redirect a bare /library or an unknown id", () => {
    expect(redirectFor(undefined)).toBeNull();
    expect(redirectFor("nope")).toBeNull();
    expect(redirectFor("cap:")).toBeNull();
  });
});
