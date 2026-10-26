import { describe, expect, it } from "vitest";
import { z } from "zod";

import { EVIDENCE_KIND_LABELS } from "../display-labels";
import { evidenceList } from "../evidence-list";
import { identifierList } from "../identifier-list";
import { ARRAY_MAX, NAME_MAX } from "../limits";
import { choices, flag, ref, tags } from "../lists/filter-kinds";
import { PAGE_LIMIT_DEFAULT, PAGE_LIMIT_MAX } from "../pagination";
import { LIST_DEFS, testCaseId } from "../testing";
import { EVIDENCE_KINDS } from "../vocab";

const caseId = testCaseId(1);
const entityId = "6f1c1f0e-8a59-4d3b-9a3e-0d7f3a1b2c4d";
const parse = (input: object) =>
  evidenceList.input.safeParse({ caseId, ...input });

describe("def.input (the wire)", () => {
  it("defaults the page size and caps it", () => {
    expect(parse({})).toMatchObject({
      success: true,
      data: { limit: PAGE_LIMIT_DEFAULT },
    });
    expect(parse({ limit: PAGE_LIMIT_MAX + 1 }).success).toBe(false);
  });

  it("rejects a trimmed q of 1 or 2 characters and takes 3 or more", () => {
    expect(parse({ q: "ab" }).success).toBe(false);
    expect(parse({ q: "  a  " }).success).toBe(false);
    expect(parse({ q: " abc " })).toMatchObject({
      success: true,
      data: { q: "abc" },
    });
    expect(parse({ q: "x".repeat(NAME_MAX + 1) }).success).toBe(false);
  });

  it("takes a flag only as true", () => {
    expect(parse({ hidden: true }).success).toBe(true);
    expect(parse({ hidden: false }).success).toBe(false);
  });

  it("rejects both members of an exclusive pair", () => {
    expect(parse({ hidden: true, unattached: true }).success).toBe(false);
    expect(parse({ unprocessed: true, unattached: true }).success).toBe(true);
  });

  it("takes declared vocabulary and sorts only", () => {
    expect(parse({ kind: ["file", "other"], sort: "label.desc" }).success).toBe(
      true
    );
    expect(parse({ kind: ["pdf"] }).success).toBe(false);
    expect(parse({ sort: "kind.asc" }).success).toBe(false);
    expect(parse({ entityId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("def.searchWith (the URL)", () => {
  const schema = evidenceList.searchWith({
    id: z.string().max(NAME_MAX).optional(),
  });

  it("drops a short q, a bad sort and a bad value instead of failing", () => {
    expect(
      schema.parse({
        q: "ab",
        sort: "kind.asc",
        kind: ["pdf"],
        hidden: false,
        id: "row",
      })
    ).toEqual({
      q: undefined,
      sort: undefined,
      kind: undefined,
      hidden: undefined,
      id: "row",
    });
  });

  it("keeps valid list params", () => {
    expect(
      schema.parse({ q: " acme ", kind: ["file"], sort: "label.asc" })
    ).toMatchObject({
      q: "acme",
      kind: ["file"],
      sort: "label.asc",
    });
  });
});

describe("the canonical query", () => {
  it("fills the default sort and drops a short q", () => {
    expect(evidenceList.queryOf({ q: "ab" })).toEqual({
      filters: {
        hidden: false,
        unprocessed: false,
        unattached: false,
        kind: [],
        entityId: null,
      },
      q: null,
      sort: "captured.desc",
    });
  });

  it("keys a view the same whatever the value order, duplicates or explicit default", () => {
    const a = identifierList.queryOf({ type: ["phone", "email", "phone"] });
    const b = identifierList.queryOf({
      type: ["email", "phone"],
      sort: "value.asc",
    });
    expect(identifierList.keyOf(a)).toBe(identifierList.keyOf(b));
    expect(a.filters.type).toEqual(["email", "phone"]);
  });

  it("resolves an exclusive pair from the URL, keeping a fixed filter", () => {
    const query = evidenceList.queryOf({ hidden: true, unattached: true });
    expect([query.filters.hidden, query.filters.unattached]).toEqual([
      true,
      false,
    ]);
    const pinned = evidenceList.queryOf({ hidden: true }, { unattached: true });
    expect([pinned.filters.hidden, pinned.filters.unattached]).toEqual([
      false,
      true,
    ]);
  });

  it("writes the URL patch without fixed filters or the default sort", () => {
    const fixed = { entityId };
    const query = evidenceList.queryOf({ hidden: true }, fixed);
    expect(query.filters.entityId).toBe(entityId);
    expect(evidenceList.toSearch(query, fixed)).toEqual({
      hidden: true,
      unprocessed: undefined,
      unattached: undefined,
      kind: undefined,
      q: undefined,
      sort: undefined,
    });
  });

  it("does not count a fixed filter as filtered, and Clear keeps it", () => {
    const fixed = { entityId };
    const query = evidenceList.queryOf({ sort: "label.asc", q: "acme" }, fixed);
    expect(evidenceList.isFiltered(query, fixed)).toBe(true);
    const cleared = evidenceList.cleared(query, fixed);
    expect(evidenceList.isFiltered(cleared, fixed)).toBe(false);
    expect(cleared.filters.entityId).toBe(entityId);
    expect(cleared.sort).toBe("label.asc");
  });

  it("never edits a fixed filter, and does not offer one it would clear", () => {
    const fixed = { hidden: true } as const;
    const query = evidenceList.queryOf({}, fixed);
    expect(evidenceList.withFilter(query, "unprocessed", true, fixed)).toBe(
      query
    );
    expect(evidenceList.withFilter(query, "hidden", false, fixed)).toBe(query);
    expect(evidenceList.availableFilters(fixed)).toEqual(["kind", "entityId"]);
    expect(evidenceList.availableFilters()).toEqual([
      "hidden",
      "unprocessed",
      "unattached",
      "kind",
      "entityId",
    ]);
    const pinned = evidenceList.queryOf({}, { unattached: true });
    const set = evidenceList.withFilter(pinned, "unprocessed", true, {
      unattached: true,
    });
    expect(set.filters).toMatchObject({ unprocessed: true, unattached: true });
  });

  it("removes the exclusive partners of a filter it sets", () => {
    const query = evidenceList.queryOf({ unprocessed: true, unattached: true });
    const hidden = evidenceList.withFilter(query, "hidden", true);
    expect(hidden.filters).toMatchObject({
      hidden: true,
      unprocessed: false,
      unattached: false,
    });
  });

  it("splits a sort value into its declared key, direction and type", () => {
    expect(evidenceList.sortParts("captured.asc")).toEqual({
      key: "captured",
      dir: "asc",
      type: "time",
    });
  });
});

describe("filter kinds", () => {
  it("parses CLI text to the wire value", () => {
    const kind = choices("Kind", EVIDENCE_KINDS, EVIDENCE_KIND_LABELS);
    expect(kind.cli.parse("file, other")).toEqual(["file", "other"]);
    expect(kind.cli.safeParse("file,pdf").success).toBe(false);
    expect(flag("Hidden").cli.safeParse(false).success).toBe(false);
    expect(ref("Entity", "entity").cli.parse(" acme-ltd ")).toBe("acme-ltd");
    expect(tags("Cap", { maxLength: 8 }).cli.parse("b,a,,b")).toEqual([
      "b",
      "a",
      "b",
    ]);
  });

  it("bounds every wire array and string", () => {
    const capTags = tags("Cap", { maxLength: 8 });
    expect(capTags.wire.safeParse(["x".repeat(9)]).success).toBe(false);
    expect(
      capTags.wire.safeParse(Array.from({ length: ARRAY_MAX + 1 }, () => "x"))
        .success
    ).toBe(false);
    expect(
      choices("Kind", EVIDENCE_KINDS, EVIDENCE_KIND_LABELS).wire.safeParse([
        ...EVIDENCE_KINDS,
        "file",
      ]).success
    ).toBe(false);
  });
});

describe("LIST_DEFS", () => {
  it("names each list once and uses no reserved param", () => {
    const names = LIST_DEFS.map((def) => def.name);
    expect(new Set(names).size).toBe(names.length);
    for (const def of LIST_DEFS) {
      const params = [
        ...Object.keys(def.filters),
        ...Object.keys(def.scope.shape),
      ];
      expect(
        params.filter((key) => ["q", "sort", "cursor", "limit"].includes(key))
      ).toEqual([]);
    }
  });
});
