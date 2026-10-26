import { Effect } from "effect";

import type { ListPageWindow, ListRepo, ListRow } from "@watchdog/db";
import { ARRAY_MAX, opsOf } from "@watchdog/schemas/shared";
import type {
  AnyListDef,
  ListInput,
  ListPage,
  ListQuery,
  ListScope,
  ListTotal,
} from "@watchdog/schemas/shared";

import type { Db } from "./db-service";
import { decodeListCursor, fingerprintOf, nextListCursor } from "./list-cursor";
import type { ListCursorSpec } from "./list-cursor";
import { tryDbWith } from "./postgres-effect";
import type { DomainTag } from "./tagged-errors";

/**
 * The one list service body (ADR-0007). A list service authorises its scope, then calls this
 * with the list's declaration, its db binding and the step that turns rows into wire items:
 *
 *   query  = opsOf(def).queryOf(input)       the canonical meaning (input already validated by
 *                                            `def.input`: a 1–2 character q was a 400)
 *   spec   = listPageSpec(def, scope, query) sort, fingerprint, key type
 *   after  = decodeListCursor(cursor, spec)  InvalidError or StaleCursorError, both 400
 *   rows   = repo.page(limit + 1)            keyset, one direction
 *   total  = first page only: a short page IS the total; a full one asks `countCapped` AFTER
 *   items  = toItems(rows.slice(0, limit))
 *
 * Sequential by design: whether the first page is full is known only after the page returns,
 * so a short first page costs no count query and a full one costs one capped scan.
 */

/** A list repo's calls as Effects: hand-written because its methods are generic (`repoFx` would widen them). */
function listRepoFx<Def extends AnyListDef, Row extends ListRow>(
  repo: ListRepo<Def, Row>
) {
  return {
    page: (
      scope: ListScope<Def>,
      query: ListQuery<Def>,
      window: ListPageWindow
    ) => tryDbWith((exec) => repo.page(exec, scope, query, window)),
    countCapped: (scope: ListScope<Def>, query: ListQuery<Def>, cap: number) =>
      tryDbWith((exec) => repo.countCapped(exec, scope, query, cap)),
    byIds: (scope: ListScope<Def>, ids: readonly string[]) =>
      tryDbWith((exec) => repo.byIds(exec, scope, ids)),
  };
}

/** A stable text of the scope (keys sorted), part of the fingerprint. */
function scopeKeyOf(scope: unknown): string {
  const entries =
    typeof scope === "object" && scope !== null ? Object.entries(scope) : [];
  return JSON.stringify(
    entries.sort(([a], [b]) => Number(a > b) - Number(a < b))
  );
}

/** The cursor spec of one view. Exported for the cursor tests. */
export function listPageSpec<Def extends AnyListDef>(
  def: Def,
  scope: ListScope<Def>,
  query: ListQuery<Def>
): ListCursorSpec {
  const ops = opsOf(def);
  return {
    list: def.name,
    sort: query.sort,
    fingerprint: fingerprintOf(`${scopeKeyOf(scope)}\n${ops.keyOf(query)}`),
    key: ops.sortParts(query.sort).type,
  };
}

function totalOf(count: number, cap: number): ListTotal {
  return count > cap
    ? { count: cap, isCapped: true }
    : { count, isCapped: false };
}

export function listPageEffect<
  Def extends AnyListDef,
  Row extends ListRow,
  Item,
>(args: {
  readonly def: Def;
  readonly repo: ListRepo<Def, Row>;
  /** Already authorised (`assertCaseInOrgEffect`). Part of the fingerprint. */
  readonly scope: ListScope<Def>;
  readonly input: ListInput<Def>;
  readonly toItems: (
    rows: readonly Row[]
  ) => Effect.Effect<readonly Item[], DomainTag, Db>;
}): Effect.Effect<ListPage<Item>, DomainTag, Db> {
  return Effect.gen(function* listPageGen() {
    const { def, scope, input } = args;
    const ops = opsOf(def);
    const repo = listRepoFx(args.repo);
    const query = ops.queryOf(input);
    const spec = listPageSpec(def, scope, query);
    const after = yield* decodeListCursor(input.cursor, spec);
    const limit = Math.min(
      Math.max(1, Math.trunc(input.limit)),
      ops.pageLimit.max
    );
    const rows = yield* repo.page(scope, query, { limit: limit + 1, after });
    let total: ListTotal | null = null;
    if (after === undefined) {
      total =
        rows.length <= limit
          ? totalOf(rows.length, ops.totalCap)
          : totalOf(
              yield* repo.countCapped(scope, query, ops.totalCap),
              ops.totalCap
            );
    }
    const items = yield* args.toItems(rows.slice(0, limit));
    return {
      items: [...items],
      nextCursor: nextListCursor(rows, limit, spec),
      total,
    };
  });
}

/**
 * Rows by id, for a URL-selected row that is not loaded: the same binding and scope, `id IN
 * (...)`, at most `ARRAY_MAX` ids (more is a caller error the wire refuses first). Filters do not
 * apply, so a selected row shows even when the current filter hides it. Get-by-id is
 * `listByIdsEffect(..., [id])` and its first item.
 */
export function listByIdsEffect<
  Def extends AnyListDef,
  Row extends ListRow,
  Item,
>(args: {
  readonly repo: ListRepo<Def, Row>;
  readonly scope: ListScope<Def>;
  readonly ids: readonly string[];
  readonly toItems: (
    rows: readonly Row[]
  ) => Effect.Effect<readonly Item[], DomainTag, Db>;
}): Effect.Effect<readonly Item[], DomainTag, Db> {
  return Effect.gen(function* listByIdsGen() {
    const rows = yield* listRepoFx(args.repo).byIds(
      args.scope,
      args.ids.slice(0, ARRAY_MAX)
    );
    return yield* args.toItems(rows);
  });
}

/** What a capped read answers: every matching row up to the cap, and whether more matched. */
export type CappedList<Item> = {
  readonly items: Item[];
  readonly isTruncated: boolean;
};

/**
 * The first `cap` rows of one view of a declared list, in the query's sort, with no cursor and no
 * count: an envelope for a screen that needs a whole set at once and cannot page it (the Tasks
 * board's open columns, `tasks.board`). It reads `cap + 1` rows; the extra one only says the set
 * was cut. The caller authorises the scope and builds the query through `opsOf(def).queryOf`.
 */
export function listCappedEffect<
  Def extends AnyListDef,
  Row extends ListRow,
  Item,
>(args: {
  readonly def: Def;
  readonly repo: ListRepo<Def, Row>;
  readonly scope: ListScope<Def>;
  readonly query: ListQuery<NoInfer<Def>>;
  readonly cap: number;
  readonly toItems: (
    rows: readonly Row[]
  ) => Effect.Effect<readonly Item[], DomainTag, Db>;
}): Effect.Effect<CappedList<Item>, DomainTag, Db> {
  return Effect.gen(function* listCappedGen() {
    const rows = yield* listRepoFx(args.repo).page(args.scope, args.query, {
      limit: args.cap + 1,
      after: undefined,
    });
    const items = yield* args.toItems(rows.slice(0, args.cap));
    return { items: [...items], isTruncated: rows.length > args.cap };
  });
}
