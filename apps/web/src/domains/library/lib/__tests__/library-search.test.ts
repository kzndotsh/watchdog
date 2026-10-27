import { describe, expect, it } from "vitest";

import { quickPickKinds } from "@/domains/library/lib/input-kinds";
import {
  libraryCategories,
  needsKeyCount,
  buildLibraryEntries,
} from "@/domains/library/lib/library-entries";
import { libraryList } from "@/domains/library/lib/library-list";
import { librarySearchSchema } from "@/domains/library/lib/library-search";
import { buildCapListItem, buildPlaybookListItem } from "@/testing/records";
import { opsOf } from "@watchdog/schemas/shared";

describe("library search", () => {
  it("is the list's search plus the category, dropping junk", () => {
    expect(
      librarySearchSchema.parse({
        q: "dns",
        kind: ["email"],
        readiness: ["ready"],
        thirdParty: true,
        commercialUse: ["allowed"],
        cat: " network ",
      })
    ).toMatchObject({
      q: "dns",
      kind: ["email"],
      readiness: ["ready"],
      thirdParty: true,
      commercialUse: ["allowed"],
      cat: "network",
    });
  });

  it("reads the URL as the list's canonical query and writes it back as a short patch", () => {
    const ops = opsOf(libraryList);
    const query = ops.queryOf({ q: "dns", kind: ["email"], thirdParty: true });
    expect(query.filters).toEqual({
      kind: ["email"],
      readiness: [],
      thirdParty: true,
      commercialUse: [],
    });
    expect(ops.toSearch(query)).toMatchObject({
      q: "dns",
      kind: ["email"],
      thirdParty: true,
      readiness: undefined,
      commercialUse: undefined,
    });
    expect(ops.toSearch(ops.cleared(query))).toMatchObject({
      q: undefined,
      kind: undefined,
      thirdParty: undefined,
    });
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
