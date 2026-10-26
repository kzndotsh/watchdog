/**
 * Type test (ADR-0007): `pnpm typecheck` compiles this file, so every `@ts-expect-error` below
 * fails the build the day the mistake it marks starts to compile (an unused directive is
 * TS2578). The positive cases prove the types stay exact, not `any` or `unknown`. The runtime
 * assertions only keep vitest honest.
 */
import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { EVIDENCE_KIND_LABELS } from "../display-labels";
import { evidenceList } from "../evidence-list";
import { caseScopeInputSchema } from "../graph-scope";
import { identifierList } from "../identifier-list";
import { NAME_MAX } from "../limits";
import { defineList, opsOf } from "../lists/define-list";
import type {
  AnyListDef,
  ListInput,
  ListQuery,
  ListSearch,
  ListSearchPatch,
  ListWireInput,
  SortValue,
  UnfixedSearch,
  UnfixedSearchPatch,
} from "../lists/define-list";
import { choices, flag } from "../lists/filter-kinds";
import { testCaseId } from "../testing";
import { EVIDENCE_KINDS } from "../vocab";
import type { EvidenceKind, IdentifierType } from "../vocab";

type Ev = typeof evidenceList;
const caseId = testCaseId(1);
const query: ListQuery<Ev> = evidenceList.queryOf({});

const sorts = {
  captured: { label: "Captured", type: "time", dirs: ["desc"] },
} as const;
const noun = { one: "x", many: "xs" } as const;

describe("list declaration: exact types", () => {
  it("keeps sort values, vocabularies and flags literal", () => {
    expectTypeOf<SortValue<Ev>>().toEqualTypeOf<
      "captured.desc" | "captured.asc" | "label.asc" | "label.desc"
    >();
    expectTypeOf(query.filters.kind).toEqualTypeOf<readonly EvidenceKind[]>();
    expectTypeOf(query.filters.hidden).toEqualTypeOf<boolean>();
    expectTypeOf(query.filters.entityId).toEqualTypeOf<string | null>();
    const registry: readonly AnyListDef[] = [evidenceList, identifierList];
    expect(registry).toHaveLength(2);
  });

  it("types the oRPC input at both ends", () => {
    expectTypeOf<z.input<Ev["input"]>>().toEqualTypeOf<ListWireInput<Ev>>();
    expectTypeOf<z.output<Ev["input"]>>().toEqualTypeOf<ListInput<Ev>>();
    expectTypeOf<z.input<Ev["input"]>>().not.toBeUnknown();
    expectTypeOf<z.input<Ev["input"]>>().not.toBeAny();
    const clientOk: z.input<Ev["input"]> = {
      caseId,
      kind: ["file"],
      q: "acme",
    };
    const serverOk: ListInput<Ev> = {
      caseId,
      kind: ["file", "other"],
      hidden: true,
      limit: 50,
      sort: "label.asc",
    };
    expect([clientOk.q, serverOk.limit]).toEqual(["acme", 50]);
  });

  it("types the route search exactly, with the route's own params", () => {
    const schema = identifierList.searchWith({
      id: z.string().max(NAME_MAX).optional(),
    });
    type Search = z.output<typeof schema>;
    expectTypeOf<Search>().not.toBeAny();
    expectTypeOf<Search>().toExtend<ListSearch<typeof identifierList>>();
    expectTypeOf<Search["id"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Search["type"]>().toEqualTypeOf<
      readonly IdentifierType[] | undefined
    >();
    expectTypeOf<Search>().not.toHaveProperty("bogus");
    const patch: ListSearchPatch<typeof identifierList> = {
      type: ["email"],
      q: "acme",
    };
    expect(patch.q).toBe("acme");
  });

  it("reaches the typed API from generic code through opsOf", () => {
    const keyOf = <Def extends AnyListDef>(
      def: Def,
      search: ListSearch<Def>
    ) => {
      const ops = opsOf(def);
      return ops.keyOf(ops.queryOf(search));
    };
    expectTypeOf(keyOf<Ev>).returns.toEqualTypeOf<string>();
    expect(keyOf(evidenceList, {})).toBe(
      evidenceList.keyOf(evidenceList.queryOf({}))
    );
  });
});

describe("list declaration: mistakes that do not compile", () => {
  it("rejects an undeclared sort value", () => {
    // @ts-expect-error -- "kind" is not a declared sort key
    const badKey: SortValue<Ev> = "kind.asc";
    // @ts-expect-error -- "sideways" is not a direction
    const badDir: SortValue<Ev> = "captured.sideways";
    const badDefault = () =>
      defineList({
        name: "bad-default",
        noun,
        scope: caseScopeInputSchema,
        filters: { hidden: flag("Hidden") },
        sorts,
        // @ts-expect-error -- "captured.asc" is not offered
        defaultSort: "captured.asc",
      });
    const twiceDirs = {
      captured: { label: "Captured", type: "time", dirs: ["asc", "asc"] },
    } as const;
    const twiceDir = () =>
      defineList({
        name: "bad-dirs",
        noun,
        scope: caseScopeInputSchema,
        filters: { hidden: flag("Hidden") },
        // @ts-expect-error -- a direction listed twice
        sorts: twiceDirs,
        defaultSort: "captured.asc",
      });
    expect([badKey, badDir, typeof badDefault, typeof twiceDir]).toHaveLength(
      4
    );
  });

  it("rejects a bad enum value, false on a flag and incomplete labels", () => {
    // @ts-expect-error -- "pdf" is not an EvidenceKind
    const badKind: ListInput<Ev> = { caseId, kind: ["pdf"], limit: 50 };
    // @ts-expect-error -- flags are true-only: `false` is not a wire value
    const falseFlag: ListInput<Ev> = { caseId, hidden: false, limit: 50 };
    // @ts-expect-error -- "pdf" is not an EvidenceKind on the client side either
    const clientBadKind: z.input<Ev["input"]> = { caseId, kind: ["pdf"] };
    // @ts-expect-error -- the option labels must cover the declared values
    const partial = () => choices("Kind", EVIDENCE_KINDS, { file: "File" });
    const noDefault = { default: ["file"] } as const;
    const withDefault = () =>
      // @ts-expect-error -- no defaults on list filters: absent means everything
      choices("Kind", EVIDENCE_KINDS, EVIDENCE_KIND_LABELS, noDefault);
    expect([
      badKind,
      falseFlag,
      clientBadKind,
      typeof partial,
      typeof withDefault,
    ]).toHaveLength(5);
  });

  it("rejects unknown keys in the client input", () => {
    // @ts-expect-error -- `bogus` is not a param of the Evidence list
    const unknownKey: z.input<Ev["input"]> = { caseId, bogus: 1 };
    expect(unknownKey.caseId).toBe(caseId);
  });

  it("rejects a reserved filter name and a scope-key collision", () => {
    const reserved = () =>
      defineList({
        name: "bad-reserved",
        noun,
        scope: caseScopeInputSchema,
        filters: {
          // @ts-expect-error -- `sort` is a reserved list param (q, sort, cursor, limit)
          sort: flag("Sort"),
        },
        sorts,
        defaultSort: "captured.desc",
      });
    const collision = () =>
      defineList({
        name: "bad-scope-collision",
        noun,
        scope: caseScopeInputSchema,
        filters: {
          // @ts-expect-error -- a filter may not share a name with a scope key
          caseId: flag("Case"),
        },
        sorts,
        defaultSort: "captured.desc",
      });
    const reservedScope = () =>
      defineList({
        name: "bad-scope-reserved",
        noun,
        // @ts-expect-error -- a scope key may not be a reserved list param
        scope: z.object({
          caseId: z.string().max(NAME_MAX),
          q: z.string().max(NAME_MAX),
        }),
        filters: { hidden: flag("Hidden") },
        sorts,
        defaultSort: "captured.desc",
      });
    expect([
      typeof reserved,
      typeof collision,
      typeof reservedScope,
    ]).toHaveLength(3);
  });

  it("rejects an exclusive pair that is not two known filters", () => {
    const unknownFilter = () =>
      defineList({
        name: "bad-exclusive",
        noun,
        scope: caseScopeInputSchema,
        filters: { hidden: flag("Hidden"), unattached: flag("Unattached") },
        // @ts-expect-error -- "unprocessed" is not a filter of this list
        exclusive: [["hidden", "unprocessed"]],
        sorts,
        defaultSort: "captured.desc",
      });
    const self = () =>
      defineList({
        name: "bad-self-exclusive",
        noun,
        scope: caseScopeInputSchema,
        filters: { hidden: flag("Hidden"), unattached: flag("Unattached") },
        // @ts-expect-error -- a filter cannot exclude itself
        exclusive: [["hidden", "hidden"]],
        sorts,
        defaultSort: "captured.desc",
      });
    expect([typeof unknownFilter, typeof self]).toHaveLength(2);
  });

  it("keeps a fixed filter out of the URL", () => {
    type Fixed = { entityId: string };
    const fixed: Fixed = { entityId: "e" };
    const ok = evidenceList.queryOf({ kind: ["file"] }, fixed);
    // @ts-expect-error -- `entityId` is fixed: it may not also come from the URL
    const fromUrl = evidenceList.queryOf({ entityId: "other" }, fixed);
    // @ts-expect-error -- and the URL search type of that screen forbids it
    const search: UnfixedSearch<Ev, "entityId"> = { entityId: "other" };
    // @ts-expect-error -- nor can the patch write it to the URL
    const patch: UnfixedSearchPatch<Ev, "entityId"> = { entityId: "other" };
    expectTypeOf(evidenceList.toSearch(ok, fixed)).not.toHaveProperty(
      "entityId"
    );
    expect([fromUrl.filters.entityId, search, patch]).toHaveLength(3);
  });
  it("keeps a route's own search params off the list's params", () => {
    const ok = evidenceList.searchWith({
      id: z.string().max(NAME_MAX).optional(),
    });
    expect(ok.parse({ id: "row" })).toMatchObject({ id: "row" });
    const looseSort = { sort: z.string().max(NAME_MAX).optional() };
    // @ts-expect-error -- `sort` is the list's: a route may not replace its check
    expect(() => evidenceList.searchWith(looseSort)).toThrow(
      /reuse list params: sort/
    );
    const looseKind = { kind: z.string().max(NAME_MAX).optional() };
    // @ts-expect-error -- `kind` is a filter of the list
    expect(() => evidenceList.searchWith(looseKind)).toThrow(
      /reuse list params: kind/
    );
  });

  it("takes no q for a list that declares no search", () => {
    const plain = defineList({
      name: "no-search",
      noun,
      scope: caseScopeInputSchema,
      filters: { hidden: flag("Hidden") },
      sorts,
      defaultSort: "captured.desc",
    });
    expectTypeOf<ListSearch<typeof plain>>().not.toHaveProperty("q");
    expectTypeOf<z.input<(typeof plain)["input"]>>().not.toHaveProperty("q");
    // @ts-expect-error -- the client input has no `q`
    const wire: z.input<(typeof plain)["input"]> = { caseId, q: "acme" };
    // @ts-expect-error -- nor does the URL search
    const url: ListSearch<typeof plain> = { q: "acme" };
    expect(plain.input.parse(wire)).not.toHaveProperty("q");
    expect(plain.searchWith({}).parse(url)).not.toHaveProperty("q");
  });
});
