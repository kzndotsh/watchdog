import { describe, expect, it } from "vitest";

import { buildInputKindIndex } from "@/domains/library/lib/input-kinds";
import { buildLibraryEntries } from "@/domains/library/lib/library-entries";
import {
  entryMatchesQuery,
  filterLibraryEntries,
  isLibraryFiltered,
} from "@/domains/library/lib/library-filters";
import {
  EMPTY_LIBRARY_FILTERS,
  type LibraryFilters,
} from "@/domains/library/types";
import {
  buildCapListItem,
  buildPlaybookListItem,
  testCapProvider,
} from "@/testing/records";

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

function titles(filters: Partial<LibraryFilters>): string[] {
  const merged = { ...EMPTY_LIBRARY_FILTERS, ...filters };
  return filterLibraryEntries(
    entries,
    merged,
    merged.inputKind === null ? undefined : index.get(merged.inputKind)
  )
    .map((entry) => entry.title)
    .sort();
}

describe("filterLibraryEntries", () => {
  it("shows everything with no filters", () => {
    expect(titles({})).toHaveLength(5);
    expect(isLibraryFiltered(EMPTY_LIBRARY_FILTERS)).toBe(false);
  });

  it("start from what you have: lists exactly the Caps and Playbooks that take the kind", () => {
    expect(titles({ inputKind: "email" })).toEqual([
      "Email identity",
      "Gravatar lookup",
      "HIBP lookup",
    ]);
    expect(titles({ inputKind: "domain" })).toEqual([
      "DNS lookup",
      "Shodan lookup",
    ]);
    expect(titles({ inputKind: "phone" })).toEqual([]);
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
    expect(titles({ isThirdPartyOnly: true })).toEqual(["Shodan lookup"]);
    expect(titles({ commercialUse: ["allowed"] })).toEqual([
      "Email identity",
      "Gravatar lookup",
    ]);
    expect(titles({ commercialUse: ["restricted"] })).toEqual([
      "Shodan lookup",
    ]);
  });

  it("combines filters", () => {
    expect(
      titles({ inputKind: "email", readiness: ["ready"], q: "gravatar" })
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
