import { describe, expect, it } from "vitest";

import { buildInputKindIndex } from "@/domains/library/lib/input-kinds";
import { buildLibraryEntries } from "@/domains/library/lib/library-entries";
import {
  entryMatchesQuery,
  filterLibraryEntries,
} from "@/domains/library/lib/library-filters";
import { libraryList } from "@/domains/library/lib/library-list";
import {
  buildCapListItem,
  buildPlaybookListItem,
  testCapProvider,
} from "@/testing/records";
import { opsOf, type ListSearch } from "@watchdog/schemas/shared";

const entries = buildLibraryEntries({
  caps: [
    buildCapListItem(),
    buildCapListItem({
      id: "network.shodan.lookup",
      title: "Shodan lookup",
      description: "Open ports and banners",
      egress: ["account_lookup"],
      contacts: [
        { kind: "provider", host: "api.vendor.test", access: "keyed" },
      ],
      provider: {
        ...testCapProvider,
        name: "Shodan",
        commercialUse: "restricted",
      },
      credentials: [{ name: "SHODAN_API_KEY" }],
    }),
    buildCapListItem({
      id: "identity.gravatar.lookup",
      title: "Gravatar lookup",
      consumes: [{ kind: "identifier", type: "email" }],
      provider: {
        ...testCapProvider,
        name: "Automattic",
        commercialUse: "allowed",
      },
    }),
    buildCapListItem({
      id: "breach.hibp.lookup",
      title: "HIBP lookup",
      consumes: [{ kind: "identifier", type: "email" }],
      disabledReason: "breach_disabled",
    }),
  ],
  playbooks: [
    buildPlaybookListItem({
      id: "email-identity",
      title: "Email identity",
      seedKinds: ["email"],
      steps: ["identity.gravatar.lookup"],
    }),
  ],
  configured: new Set<string>(),
});
const index = buildInputKindIndex(entries);

function titles(search: ListSearch<typeof libraryList>): string[] {
  return filterLibraryEntries(
    entries,
    opsOf(libraryList).queryOf(search),
    index
  )
    .map((entry) => entry.title)
    .sort();
}

describe("filterLibraryEntries", () => {
  it("shows everything with no filters", () => {
    expect(titles({})).toHaveLength(5);
    expect(opsOf(libraryList).isFiltered(opsOf(libraryList).queryOf({}))).toBe(
      false
    );
  });

  it("start from what you have: lists exactly the Caps and Playbooks that take the kind", () => {
    expect(titles({ kind: ["email"] })).toEqual([
      "Email identity",
      "Gravatar lookup",
      "HIBP lookup",
    ]);
    expect(titles({ kind: ["domain"] })).toEqual([
      "DNS lookup",
      "Shodan lookup",
    ]);
    expect(titles({ kind: ["phone"] })).toEqual([]);
  });

  it("searches title, id, provider and description", () => {
    expect(titles({ q: "banners" })).toEqual(["Shodan lookup"]);
    // A Playbook matches the providers of its steps.
    expect(titles({ q: "automattic" })).toEqual([
      "Email identity",
      "Gravatar lookup",
    ]);
    expect(titles({ q: "hibp" })).toEqual(["HIBP lookup"]);
    expect(titles({ q: "network dns" })).toEqual(["DNS lookup"]);
    expect(titles({ q: "  " })).toHaveLength(5);
  });

  it("filters by readiness", () => {
    expect(titles({ readiness: ["needs_key"] })).toEqual(["Shodan lookup"]);
    expect(titles({ readiness: ["off_by_operator"] })).toEqual(["HIBP lookup"]);
    expect(titles({ readiness: ["needs_key", "off_by_operator"] })).toEqual([
      "HIBP lookup",
      "Shodan lookup",
    ]);
  });

  it("filters by third-party egress and provider commercial use", () => {
    expect(titles({ thirdParty: true })).toEqual(["Shodan lookup"]);
    expect(titles({ commercialUse: ["allowed"] })).toEqual([
      "Email identity",
      "Gravatar lookup",
    ]);
    expect(titles({ commercialUse: ["restricted"] })).toEqual([
      "Shodan lookup",
    ]);
  });

  it("start from what you have: more than one kind lists the entries that take any of them", () => {
    expect(titles({ kind: ["domain", "email"] })).toEqual([
      "DNS lookup",
      "Email identity",
      "Gravatar lookup",
      "HIBP lookup",
      "Shodan lookup",
    ]);
  });

  it("combines filters", () => {
    expect(
      titles({ kind: ["email"], readiness: ["ready"], q: "gravatar" })
    ).toEqual(["Gravatar lookup"]);
  });
});

describe("entryMatchesQuery", () => {
  it("matches case-insensitively", () => {
    const [first] = entries;
    expect(first && entryMatchesQuery(first, first.title.toUpperCase())).toBe(
      true
    );
  });
});
