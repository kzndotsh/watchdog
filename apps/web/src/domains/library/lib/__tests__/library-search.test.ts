import { describe, expect, it } from "vitest";

import { quickPickKinds } from "@/domains/library/lib/input-kinds";
import {
  libraryCategories,
  needsKeyCount,
  buildLibraryEntries,
} from "@/domains/library/lib/library-entries";
import {
  entryPathFromKey,
  filtersFromSearch,
  searchPatchFromFilters,
} from "@/domains/library/lib/library-search";
import { EMPTY_LIBRARY_FILTERS } from "@/domains/library/types";
import { buildCapListItem, buildPlaybookListItem } from "@/testing/records";

describe("library search", () => {
  it("maps the URL to filters and back, dropping empty values", () => {
    expect(filtersFromSearch({})).toEqual(EMPTY_LIBRARY_FILTERS);
    const filters = filtersFromSearch({
      q: "dns",
      kind: "email",
      status: ["ready"],
      third: true,
      use: ["allowed"],
    });
    expect(filters).toEqual({
      q: "dns",
      inputKind: "email",
      readiness: ["ready"],
      isThirdPartyOnly: true,
      commercialUse: ["allowed"],
    });
    expect(searchPatchFromFilters(filters)).toEqual({
      q: "dns",
      kind: "email",
      status: ["ready"],
      third: true,
      use: ["allowed"],
    });
    expect(searchPatchFromFilters(EMPTY_LIBRARY_FILTERS)).toEqual({
      q: undefined,
      kind: undefined,
      status: undefined,
      third: undefined,
      use: undefined,
    });
  });

  it("finds the page of an old entry key", () => {
    expect(entryPathFromKey("cap:network.dns.lookup")).toBe(
      "/library/caps/network.dns.lookup"
    );
    expect(entryPathFromKey("playbook:email-identity")).toBe(
      "/library/playbooks/email-identity"
    );
    expect(entryPathFromKey("cap:")).toBeNull();
    expect(entryPathFromKey("other:x")).toBeNull();
    expect(entryPathFromKey("x")).toBeNull();
    expect(entryPathFromKey(undefined)).toBeNull();
  });
});

describe("library grid helpers", () => {
  const entries = buildLibraryEntries({
    caps: [
      buildCapListItem(),
      buildCapListItem({
        id: "network.shodan.lookup",
        title: "Shodan lookup",
        credentials: [{ name: "SHODAN_API_KEY" }],
      }),
    ],
    playbooks: [buildPlaybookListItem()],
    configured: new Set<string>(),
  });

  it("lists Playbooks, then the Cap categories", () => {
    expect(libraryCategories(entries).map((c) => c.id)).toEqual([
      "playbook",
      "network",
    ]);
  });

  it("counts the entries that need a key", () => {
    expect(needsKeyCount(entries)).toBe(1);
  });

  it("picks the kinds most entries take, then the usual order", () => {
    const options = [
      { value: "url", label: "URL", count: 1 },
      { value: "email", label: "Email address", count: 1 },
      { value: "domain", label: "Domain", count: 4 },
    ];
    expect(quickPickKinds(options, 2).map((o) => o.value)).toEqual([
      "domain",
      "email",
    ]);
  });
});
