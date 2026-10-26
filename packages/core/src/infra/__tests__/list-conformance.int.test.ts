import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ListRepo, ListRow } from "@watchdog/db";
import { LIST_REPOS, listRepoOf } from "@watchdog/db/testing";
import { opsOf } from "@watchdog/schemas/shared";
import type {
  AnyListDef,
  AnyFilter,
  ListInput,
  ListPage,
} from "@watchdog/schemas/shared";
import { LIST_DEFS } from "@watchdog/schemas/testing";
import {
  captureStatements,
  LIST_CONFORMANCE,
  resetTestDb,
  testDb,
  type ConformanceRow,
  type ListConformance,
} from "@watchdog/test-db";

import { Db } from "../db-service";
import { listByIdsEffect, listPageEffect } from "../list-page";
import { runDomainWith } from "../run-domain";
import type { DomainTag } from "../tagged-errors";

/*
 * The list standard's database gate (ADR-0007), BEHAVIOUR half: one fixture per declared list
 * (`LIST_CONFORMANCE`, `@watchdog/test-db`) with ties on every sort key, NULLs in the nullable
 * one, rows on both sides of every filter and a decoy in another Case. Every expectation is
 * hand-written from the fixture, never derived from the SQL under test. The PLAN half, on the
 * audit-scale perf seed, is `list-conformance-plans.int.test.ts`.
 */

const run = runDomainWith(Db.layer);
const rowsOf = (rows: readonly ListRow[]) => Effect.succeed(rows);

type Entry = {
  readonly def: AnyListDef;
  readonly repo: ListRepo<AnyListDef, ListRow>;
  readonly fixture: ListConformance;
};

function entryOf(def: AnyListDef): Entry {
  const repo = LIST_REPOS.find((candidate) => candidate.def.name === def.name);
  const fixture = LIST_CONFORMANCE[def.name];
  if (repo === undefined || fixture === undefined) {
    throw new Error(`list ${def.name}: no binding or conformance fixture`);
  }
  return { def, repo: listRepoOf(repo), fixture };
}

/** A wire value that activates a filter of this kind (for the exclusive-pair check). */
function activeWireValue(filter: AnyFilter): unknown {
  switch (filter.kind) {
    case "flag": {
      return true;
    }
    case "choices": {
      return [filter.values[0]];
    }
    case "ref": {
      return "11111111-1111-4111-8111-000000000001";
    }
    case "tags": {
      return ["x"];
    }
    default: {
      return filter satisfies never;
    }
  }
}

describe.each(LIST_DEFS.map((def) => entryOf(def)))(
  "list $def.name: behaviour (conformance seed)",
  ({ def, repo, fixture }) => {
    const ops = opsOf(def);
    let caseId = "";
    let otherCaseId = "";
    const tagOf = new Map(fixture.rows.map((row) => [row.id, row.tag]));
    const tags = (rows: readonly ListRow[]) =>
      rows.map((row) => tagOf.get(row.id) ?? `foreign:${row.id}`);

    const inputOf = (wire: Readonly<Record<string, unknown>>) =>
      ops.input.parse({ caseId, limit: fixture.pageLimit, ...wire });
    const pageOf = (
      input: ListInput<AnyListDef>,
      overrides?: { readonly totalCap?: number; readonly scopeCaseId?: string }
    ): Promise<ListPage<ListRow>> =>
      run(
        listPageEffect({
          def:
            overrides?.totalCap === undefined
              ? def
              : { ...def, totalCap: overrides.totalCap },
          repo,
          scope: { caseId: overrides?.scopeCaseId ?? caseId },
          input,
          toItems: rowsOf,
        })
      );
    const failureOf = (input: ListInput<AnyListDef>): Promise<DomainTag> =>
      run(
        listPageEffect({
          def,
          repo,
          scope: { caseId },
          input,
          toItems: rowsOf,
        }).pipe(Effect.flip, Effect.orDie)
      );

    /** Every page of a view, following `nextCursor` to the end. */
    async function walk(
      wire: Readonly<Record<string, unknown>>
    ): Promise<readonly ListRow[]> {
      const seen: ListRow[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 50; page += 1) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- each page needs the previous cursor
        const result = await pageOf(
          inputOf(cursor === undefined ? wire : { ...wire, cursor })
        );
        expect(result.items.length).toBeLessThanOrEqual(fixture.pageLimit);
        seen.push(...result.items);
        if (result.nextCursor === null) return seen;
        cursor = result.nextCursor;
      }
      throw new Error("walk: more than 50 pages");
    }

    /** The fixture rows a query admits by the reference predicates, as tags. */
    function referenceTags(wire: Readonly<Record<string, unknown>>): string[] {
      const query = ops.queryOf(inputOf(wire));
      const filters: Readonly<Record<string, unknown>> = query.filters;
      return fixture.rows
        .filter((row: ConformanceRow) =>
          Object.keys(def.filters).every((key) => {
            const predicate = fixture.reference[key];
            if (predicate === undefined) {
              throw new Error(`${def.name}: no reference predicate for ${key}`);
            }
            return predicate(row.facts, filters[key]);
          })
        )
        .map((row) => row.tag)
        .sort();
    }

    beforeAll(async () => {
      await resetTestDb();
      const seeded = await fixture.seed(testDb);
      caseId = seeded.caseId;
      otherCaseId = seeded.otherCaseId;
    });

    afterAll(async () => {
      await resetTestDb();
    });

    it("has a hand-written order for every declared sort value", () => {
      const declared = Object.entries(def.sorts).flatMap(([key, sort]) =>
        sort.dirs.map((dir) => `${key}.${dir}`)
      );
      expect(Object.keys(fixture.orders).sort()).toEqual(declared.sort());
    });

    it("pages every declared sort and direction without gaps or duplicates under ties", async () => {
      for (const [sort, expected] of Object.entries(fixture.orders)) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one walk per sort value
        const rows = await walk({ sort });
        expect(tags(rows), sort).toEqual(expected);
      }
    });

    it("refuses another view's cursor as stale, and a malformed or foreign one as invalid", async () => {
      const [firstSort, secondSort] = Object.keys(fixture.orders);
      if (firstSort === undefined || secondSort === undefined) {
        throw new Error(`${def.name}: needs two sort values`);
      }
      const first = await pageOf(inputOf({ sort: firstSort }));
      const cursor = first.nextCursor;
      if (cursor === null) throw new Error("expected a second page");
      const [filterKey, sample] = Object.entries(fixture.samples)[0] ?? [];
      if (filterKey === undefined) throw new Error("expected a filter sample");

      const stale = [
        inputOf({ sort: secondSort, cursor }),
        inputOf({ sort: firstSort, cursor, [filterKey]: sample?.[0] }),
        inputOf({ sort: firstSort, cursor, q: "zzz" }),
      ];
      for (const input of stale) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one refusal per view
        const error = await failureOf(input);
        expect(error._tag).toBe("StaleCursorError");
        expect(error.code).toBe("cursor_stale");
      }
      const otherScope = await run(
        listPageEffect({
          def,
          repo,
          scope: { caseId: otherCaseId },
          input: inputOf({ sort: firstSort, cursor }),
          toItems: rowsOf,
        }).pipe(Effect.flip, Effect.orDie)
      );
      expect(otherScope.code).toBe("cursor_stale");

      const foreignList = Buffer.from(
        JSON.stringify([
          "not-this-list",
          firstSort,
          "000000000000",
          caseId,
          "x",
        ])
      ).toString("base64url");
      for (const garbage of ["not-a-cursor", foreignList]) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one refusal per cursor
        const error = await failureOf(
          inputOf({ sort: firstSort, cursor: garbage })
        );
        expect(error._tag).toBe("InvalidError");
        expect(error.code).toBe("invalid");
      }
    });

    it("matches the reference predicate for every filter, and refuses exclusive pairs", async () => {
      expect(Object.keys(fixture.samples).sort()).toEqual(
        Object.keys(def.filters).sort()
      );
      for (const [key, values] of Object.entries(fixture.samples)) {
        for (const value of values) {
          const wire = { [key]: value };
          // oxlint-disable-next-line eslint/no-await-in-loop -- one walk per filter value
          const rows = await walk(wire);
          expect(tags(rows).sort(), `${key}=${JSON.stringify(value)}`).toEqual(
            referenceTags(wire)
          );
        }
      }
      for (const [a, b] of def.exclusive ?? []) {
        const fa = def.filters[a];
        const fb = def.filters[b];
        if (fa === undefined || fb === undefined) throw new Error("bad pair");
        const parsed = ops.input.safeParse({
          caseId,
          [a]: activeWireValue(fa),
          [b]: activeWireValue(fb),
        });
        expect(parsed.success, `${a} with ${b}`).toBe(false);
      }
    });

    it("searches literally, matches display labels, keeps the sort and refuses a short q", async () => {
      for (const search of fixture.searches) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one walk per search
        const rows = await walk({ ...search.filters, q: search.q });
        expect(tags(rows), search.q).toEqual(search.expect);
      }
      for (const short of ["ab", " a "]) {
        expect(ops.input.safeParse({ caseId, q: short }).success, short).toBe(
          false
        );
      }
    });

    it("caps the total on the first page only, and skips the count on a short page", async () => {
      const visible = fixture.orders[Object.keys(fixture.orders)[0] ?? ""];
      const size = visible?.length ?? 0;
      expect(size).toBeGreaterThan(fixture.pageLimit + 1);

      const short = await captureStatements(() =>
        pageOf(inputOf({ limit: size + 5 }))
      );
      expect(short.result.total).toEqual({ count: size, isCapped: false });
      expect(short.statements).toHaveLength(1);

      const full = await captureStatements(() => pageOf(inputOf({})));
      expect(full.result.total).toEqual({ count: size, isCapped: false });
      expect(full.statements).toHaveLength(2);

      const capped = await pageOf(inputOf({}), {
        totalCap: fixture.pageLimit + 1,
      });
      expect(capped.total).toEqual({
        count: fixture.pageLimit + 1,
        isCapped: true,
      });

      const cursor = full.result.nextCursor ?? undefined;
      const second = await captureStatements(() => pageOf(inputOf({ cursor })));
      expect(second.result.total).toBeNull();
      expect(second.statements).toHaveLength(1);
    });

    it("fetches rows by id in the scope, whatever the filters", async () => {
      const ids = fixture.rows.map((row) => row.id);
      const rows = await run(
        listByIdsEffect({
          repo,
          scope: { caseId },
          ids: [...ids, "not-a-uuid"],
          toItems: rowsOf,
        })
      );
      expect(tags(rows).sort()).toEqual(
        fixture.rows.map((row) => row.tag).sort()
      );
      const foreign = await run(
        listByIdsEffect({
          repo,
          scope: { caseId: otherCaseId },
          ids,
          toItems: rowsOf,
        })
      );
      expect(foreign).toEqual([]);
    });
  }
);
