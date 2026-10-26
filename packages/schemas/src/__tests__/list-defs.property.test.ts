import { describe, expect, it } from "vitest";

import { fc } from "@watchdog/test-kit/fc";

import { evidenceList } from "../evidence-list";
import { identifierList } from "../identifier-list";
import { opsOf } from "../lists/define-list";
import type { AnyListDef, FixedFilters } from "../lists/define-list";
import { assertNeverFilter } from "../lists/filter-kinds";
import type { AnyFilter, QueryValue, WireValue } from "../lists/filter-kinds";
import { LIST_SEARCH_MIN_LENGTH } from "../lists/list-page";
import { LIST_DEFS, testCaseId } from "../testing";

/**
 * The canonical form is the contract four surfaces share (URL, Query key, cursor fingerprint,
 * selection key), so it is property-tested per declared list with arbitrary views. Every
 * search goes through the list's own URL schema (`searchWith`), as a route's would.
 */

const tagArb = fc.stringMatching(/^[a-z]{1,8}$/);

/** A filter's value as the URL carries it (`undefined` = not filtering). */
function urlValueArb(
  filter: AnyFilter
): fc.Arbitrary<WireValue<AnyFilter> | undefined> {
  switch (filter.kind) {
    case "flag": {
      return fc.constantFrom(undefined, true);
    }
    case "choices": {
      return fc.option(fc.shuffledSubarray([...filter.values]), {
        nil: undefined,
      });
    }
    case "ref": {
      return fc.option(fc.uuid(), { nil: undefined });
    }
    case "tags": {
      return fc.option(fc.array(tagArb, { maxLength: 4 }), { nil: undefined });
    }
    default: {
      return assertNeverFilter(filter);
    }
  }
}

/** A filter's value inside a canonical query, in any order. */
function queryValueArb(filter: AnyFilter): fc.Arbitrary<QueryValue<AnyFilter>> {
  switch (filter.kind) {
    case "flag": {
      return fc.boolean();
    }
    case "choices": {
      return fc.shuffledSubarray([...filter.values]);
    }
    case "ref": {
      return fc.option(fc.uuid(), { nil: null });
    }
    case "tags": {
      return fc.array(tagArb, { maxLength: 4 });
    }
    default: {
      return assertNeverFilter(filter);
    }
  }
}

const sortValuesOf = (def: AnyListDef) =>
  Object.entries(def.sorts).flatMap(([key, sort]) =>
    sort.dirs.map((dir) => `${key}.${dir}`)
  );

/** Raw URL search params for a list: every filter, `q` (short ones included) and `sort`. */
function rawSearchArb(def: AnyListDef) {
  const filters = Object.fromEntries(
    Object.entries(def.filters).map(([key, filter]) => [
      key,
      urlValueArb(filter),
    ])
  );
  return fc.record({
    ...filters,
    q: fc.option(fc.stringMatching(/^ ?[a-z0-9]{0,6} ?$/), { nil: undefined }),
    sort: fc.option(fc.constantFrom(...sortValuesOf(def)), { nil: undefined }),
  });
}

/** The same params with each array reversed and the default sort written out. */
function reordered(def: AnyListDef, raw: Readonly<Record<string, unknown>>) {
  const out: Record<string, unknown> = { ...raw };
  for (const [key, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) continue;
    const back: unknown[] = [];
    for (const item of value) back.unshift(item);
    out[key] = back;
  }
  out.sort = raw.sort ?? def.defaultSort;
  return out;
}

describe.each(LIST_DEFS.map((def) => [def.name, def] as const))(
  "list %s",
  (_name, def) => {
    const ops = opsOf(def);
    const url = ops.searchWith({});

    it("round-trips the URL: queryOf(toSearch(query)) is the query", () => {
      fc.assert(
        fc.property(rawSearchArb(def), (raw) => {
          const query = ops.queryOf(url.parse(raw));
          expect(ops.queryOf(url.parse(ops.toSearch(query)))).toEqual(query);
        })
      );
    });

    it("keys a view the same whatever the filter value order or an explicit default sort", () => {
      fc.assert(
        fc.property(rawSearchArb(def), (raw) => {
          const key = ops.keyOf(ops.queryOf(url.parse(raw)));
          expect(ops.keyOf(ops.queryOf(url.parse(reordered(def, raw))))).toBe(
            key
          );
        })
      );
    });

    it("never makes an input the wire rejects through withFilter", () => {
      const edit = fc.oneof(
        ...Object.entries(def.filters).map(([key, filter]) =>
          queryValueArb(filter).map((value) => ({ key, value }))
        )
      );
      fc.assert(
        fc.property(
          rawSearchArb(def),
          fc.array(edit, { maxLength: 6 }),
          (raw, edits) => {
            let query = ops.queryOf(url.parse(raw));
            for (const { key, value } of edits)
              query = ops.withFilter(query, key, value);
            const input = { caseId: testCaseId(1), ...ops.toSearch(query) };
            expect(def.input.safeParse(input).success).toBe(true);
          }
        )
      );
    });

    it("writes a flag to the URL only as true, and a short q never", () => {
      fc.assert(
        fc.property(rawSearchArb(def), (raw) => {
          const patch: Readonly<Record<string, unknown>> = ops.toSearch(
            ops.queryOf(url.parse(raw))
          );
          for (const [key, filter] of Object.entries(def.filters)) {
            if (filter.kind === "flag")
              expect([true, undefined]).toContain(patch[key]);
          }
          const { q } = patch;
          expect(
            q === undefined ||
              (typeof q === "string" && q.length >= LIST_SEARCH_MIN_LENGTH)
          ).toBe(true);
        })
      );
    });
  }
);

describe("fixed filters (the Dossier tabs fix entityId)", () => {
  it("Evidence: never in the URL, never counted by isFiltered, kept by Clear", () => {
    const url = evidenceList.searchWith({});
    fc.assert(
      fc.property(rawSearchArb(evidenceList), fc.uuid(), (raw, entityId) => {
        const { entityId: _fromUrl, ...search } = url.parse(raw);
        const fixed = { entityId };
        const query = evidenceList.queryOf(search, fixed);
        expect(query.filters.entityId).toBe(entityId);
        expect(evidenceList.toSearch(query, fixed)).not.toHaveProperty(
          "entityId"
        );
        const cleared = evidenceList.cleared(query, fixed);
        expect(cleared.filters.entityId).toBe(entityId);
        expect(evidenceList.isFiltered(cleared, fixed)).toBe(false);
      })
    );
  });

  it("Identifiers: never in the URL, never counted by isFiltered, kept by Clear", () => {
    const url = identifierList.searchWith({});
    fc.assert(
      fc.property(rawSearchArb(identifierList), fc.uuid(), (raw, entityId) => {
        const { entityId: _fromUrl, ...search } = url.parse(raw);
        const fixed = { entityId };
        const query = identifierList.queryOf(search, fixed);
        expect(query.filters.entityId).toBe(entityId);
        expect(identifierList.toSearch(query, fixed)).not.toHaveProperty(
          "entityId"
        );
        const cleared = identifierList.cleared(query, fixed);
        expect(cleared.filters.entityId).toBe(entityId);
        expect(identifierList.isFiltered(cleared, fixed)).toBe(false);
      })
    );
  });
});

/** Fixed filters a screen could pass: any subset with values, never both members of a pair. */
function fixedArb(def: AnyListDef): fc.Arbitrary<FixedFilters<AnyListDef>> {
  const values = Object.fromEntries(
    Object.entries(def.filters).map(([key, filter]) => [
      key,
      urlValueArb(filter),
    ])
  );
  return fc.record(values).map((raw) => {
    const fixed: Record<string, WireValue<AnyFilter> | undefined> = { ...raw };
    for (const [a, b] of def.exclusive ?? []) {
      if (fixed[a] !== undefined && fixed[b] !== undefined)
        fixed[b] = undefined;
    }
    return fixed;
  });
}

describe.each(LIST_DEFS.map((def) => [def.name, def] as const))(
  "list %s with fixed filters",
  (_name, def) => {
    const ops = opsOf(def);
    const edit = fc.oneof(
      ...Object.entries(def.filters).map(([key, filter]) =>
        queryValueArb(filter).map((value) => ({ key, value }))
      ),
      fc.constant(null)
    );

    it("never changes a fixed filter, whatever the edits (null = Clear)", () => {
      fc.assert(
        fc.property(
          fixedArb(def),
          fc.array(edit, { maxLength: 8 }),
          (fixed, edits) => {
            const start = ops.queryOf({}, fixed);
            let query = start;
            for (const step of edits) {
              query =
                step === null
                  ? ops.cleared(query, fixed)
                  : ops.withFilter(query, step.key, step.value, fixed);
            }
            for (const [key, value] of Object.entries(fixed)) {
              if (value !== undefined)
                expect(query.filters[key]).toEqual(start.filters[key]);
            }
            const reloaded = ops.queryOf(
              ops.searchWith({}).parse(ops.toSearch(query, fixed)),
              fixed
            );
            expect(ops.keyOf(reloaded)).toBe(ops.keyOf(query));
          }
        )
      );
    });

    it("offers only filters that are neither fixed nor exclusive with a fixed one", () => {
      fc.assert(
        fc.property(fixedArb(def), (fixed) => {
          const query = ops.queryOf({}, fixed);
          for (const key of Object.keys(def.filters)) {
            const offered = ops.availableFilters(fixed).includes(key);
            if (fixed[key] !== undefined) expect(offered).toBe(false);
            if (!offered) {
              const filter = def.filters[key];
              if (filter === undefined) continue;
              const on = filter.kind === "flag" ? true : query.filters[key];
              expect(ops.withFilter(query, key, on ?? null, fixed)).toBe(query);
            }
          }
        })
      );
    });
  }
);
