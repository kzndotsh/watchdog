import { and, count, getTableName, ilike, inArray, or, sql } from "drizzle-orm";
import type { AnyColumn, SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

import { ARRAY_MAX, normalizeUuidList, opsOf } from "@watchdog/schemas/shared";
import type {
  AnyListDef,
  FilterKey,
  KeyData,
  ListQuery,
  ListScope,
  QueryValue,
  SortKey,
} from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { containsPattern } from "./_ilike";
import { keysetKey, keysetOrderBy, keysetWhere, sortKeyExpr } from "./_keyset";
import type { KeysetOrder, ListAfter, SortSentinel } from "./_keyset";
import { inArrayForDisplayLabelMatch } from "./_label-search";

/**
 * The SQL side of a declared list (ADR-0007), TYPED AGAINST the declaration AND the table:
 * - one predicate per declared filter, receiving that filter's canonical value type;
 * - one sort binding per declared sort key: a column of the list's table whose `data` matches
 *   the declared key type (`time` is Date, `text` string, `int` number), NOT NULL, or written
 *   `{ column, nullsAs }` with a sentinel of that type (`''` for text);
 * - one column of the list's table per declared search field;
 * - `id` is exactly the table's `id` column; `scopeColumn` a NOT NULL string column of it.
 * Sorting or searching on a joined table's column is a type error: only `base` reaches other
 * tables, for the row's display columns. Filters and search read the list's table only, so the
 * capped count (`countCapped`) runs on the table without `base`'s joins.
 *
 * Search is `OR(column ILIKE containsPattern(q))` over the search columns (`_ilike.ts` escapes
 * `%`, `_` and `\`, so they match literally), plus `column IN (...)` for `searchLabels`: the
 * values of a `choices` filter whose display label matches `q`, computed in JS.
 *
 * Raw SQL lives here and in `_keyset.ts`; the bindings in `*.repo.ts` use the builder API only.
 */

/** A column of table T matching a partial column config. */
export type OwnColumn<T extends PgTable, C extends object> = AnyColumn<
  { tableName: T["_"]["name"] } & C
>;

/** The sentinel type of a key type: text sorts NULL as `''`, the others as a value of their type. */
type SentinelOf<V> = V extends string ? "" : V;

/**
 * A nullable column sorted as `coalesce(column, nullsAs)`, allowed only written out like this,
 * and only with the matching expression index `(scope, coalesce(column, <sentinel>), id)`.
 */
export type NullableSortBinding<T extends PgTable, V> = {
  readonly column: OwnColumn<T, { data: V }>;
  readonly nullsAs: SentinelOf<V>;
};

export type SortBinding<T extends PgTable, V> =
  | OwnColumn<T, { notNull: true; data: V }>
  | NullableSortBinding<T, V>;

/** A predicate receives the canonical value (`hidden` false → `deleted_at IS NULL`); `undefined` is no condition. */
export type FilterPredicate<V> = (value: V) => SQL | undefined;

/**
 * What `base` returns: a dynamic drizzle select (`.$dynamic()`) whose rows are `Row`. Only the
 * three builder steps the repo adds are named, so any select over any joins fits.
 */
export type ListSelect<Row> = PromiseLike<Row[]> & {
  readonly where: (where: SQL | undefined) => ListSelect<Row>;
  readonly orderBy: (...order: SQL[]) => ListSelect<Row>;
  readonly limit: (limit: number) => ListSelect<Row>;
};

/** A list table: has a NOT NULL string `id`. */
export type ListTable = PgTable & {
  readonly id: AnyColumn<{ notNull: true; data: string }>;
};

/** The declared `choices` filters of a list. */
export type ChoicesKey<Def extends AnyListDef> = {
  [K in FilterKey<Def>]: Def["filters"][K] extends { readonly kind: "choices" }
    ? K
    : never;
}[FilterKey<Def>];

/** The declared search fields of a list, or never when it takes no `q`. */
type SearchField<Def extends AnyListDef> = Def["search"] extends {
  readonly fields: readonly (infer F extends string)[];
}
  ? F
  : never;

/** Every page row carries its id and the active sort key's cursor value. */
export type ListRow = {
  readonly id: string;
  readonly listKey: string | number;
};

/** The cursor value `base` must select as `listKey`. */
export type ListKeySql = SQL<string | number>;

export type ListBinding<
  Def extends AnyListDef,
  T extends ListTable,
  Row extends ListRow,
> = {
  readonly table: T;
  /**
   * `exec.select({ ...columns, listKey }).from(t).leftJoin(...).$dynamic()`: the row's columns,
   * its display joins, and `listKey` (the cursor value of the active sort) selected as given.
   */
  readonly base: (exec: DbExec, listKey: ListKeySql) => ListSelect<Row>;
  readonly id: T["id"];
  /** Leads every index of the list. */
  readonly scopeColumn: OwnColumn<T, { notNull: true; data: string }>;
  readonly scope: (scope: ListScope<Def>) => SQL;
  readonly filters: {
    readonly [K in FilterKey<Def>]: FilterPredicate<
      QueryValue<Def["filters"][K]>
    >;
  };
  /**
   * Filters that can match a small fraction of the scope (`entityId`). Each names its column and
   * needs an index led by it, or by the scope column then it, ending in the default sort key and
   * the id; the conformance test EXPLAINs the filter alone under the default sort for it.
   */
  readonly selective?: Readonly<
    Partial<Record<FilterKey<Def>, OwnColumn<T, object>>>
  >;
  readonly sorts: {
    readonly [K in SortKey<Def>]: SortBinding<
      T,
      KeyData[Def["sorts"][K]["type"]]
    >;
  };
  /**
   * Display-label matching kept from today's search: `q` also matches these `choices` filters'
   * option labels ("url archive" finds kind = 'url_archive'), as `OR column IN (...)`, added only
   * when `q` matches a label.
   */
  readonly searchLabels?: Readonly<
    Partial<Record<ChoicesKey<Def>, OwnColumn<T, { notNull: true }>>>
  >;
  readonly search: [SearchField<Def>] extends [never]
    ? undefined
    : Readonly<Record<SearchField<Def>, OwnColumn<T, { data: string }>>>;
};

/** What the conformance test reads to find the indexes a list needs (column names, not SQL). */
export type ListIndexNeeds = {
  readonly table: string;
  readonly scopeColumn: string;
  /** Per sort key: the column name (a nullable one is sorted through `coalesce`). */
  readonly sortColumns: Readonly<Record<string, string>>;
  /** Per selective filter: its column name. */
  readonly selectiveColumns: Readonly<Record<string, string>>;
  readonly searchColumns: readonly string[];
};

export type ListPageWindow = {
  /** Rows to read: the service asks for one more than it shows. */
  readonly limit: number;
  readonly after: ListAfter | undefined;
};

export type ListRepo<Def extends AnyListDef, Row> = {
  readonly def: Def;
  /** One page in the query's sort, after `window.after`, at most `window.limit` rows. */
  readonly page: (
    exec: DbExec,
    scope: ListScope<Def>,
    query: ListQuery<Def>,
    window: ListPageWindow
  ) => Promise<Row[]>;
  /** min(matching rows, cap + 1): the service calls it only after a FULL first page. */
  readonly countCapped: (
    exec: DbExec,
    scope: ListScope<Def>,
    query: ListQuery<Def>,
    cap: number
  ) => Promise<number>;
  /**
   * Rows of the scope by id (at most `ARRAY_MAX`; ids that are not uuids are skipped), in the
   * default sort. Filters do not apply: a URL-selected row shows even when a filter hides it.
   */
  readonly byIds: (
    exec: DbExec,
    scope: ListScope<Def>,
    ids: readonly string[]
  ) => Promise<Row[]>;
  readonly indexNeeds: ListIndexNeeds;
};

/**
 * Any list repo, for registries (`LIST_REPOS`) and generic tests. ERASED like `AnyListDef`: its
 * functions take `never`, so every concrete repo is assignable. Generic code calls them through
 * `listRepoOf(repo)`.
 */
export type AnyListRepo = {
  readonly def: AnyListDef;
  readonly page: (
    exec: DbExec,
    scope: never,
    query: never,
    window: ListPageWindow
  ) => Promise<readonly ListRow[]>;
  readonly countCapped: (
    exec: DbExec,
    scope: never,
    query: never,
    cap: number
  ) => Promise<number>;
  readonly byIds: (
    exec: DbExec,
    scope: never,
    ids: readonly string[]
  ) => Promise<readonly ListRow[]>;
  readonly indexNeeds: ListIndexNeeds;
};

/**
 * The typed repo inside generic code (the conformance harness), like `opsOf` for a declaration.
 * A cast at the erased boundary: every `AnyListRepo` came from `defineListRepo` over its own
 * `def`, so its functions take that list's scope and query.
 */
export function listRepoOf<Def extends AnyListDef>(
  repo: AnyListRepo & { readonly def: Def }
): ListRepo<Def, ListRow> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the erased boundary: an AnyListRepo is a ListRepo over its own def
  return repo as unknown as ListRepo<Def, ListRow>;
}

function isNullableSort<T extends PgTable, V>(
  binding: SortBinding<T, V>
): binding is NullableSortBinding<T, V> {
  return "nullsAs" in binding;
}

function sortSentinel(value: unknown): SortSentinel {
  if (value === "" || typeof value === "number" || value instanceof Date) {
    return value;
  }
  throw new TypeError(`Unsupported sort sentinel: ${String(value)}`);
}

/** Bind a declared list to SQL. Leaving out a declared filter, sort or search field is a type error. */
export function defineListRepo<
  Def extends AnyListDef,
  T extends ListTable,
  Row extends ListRow,
>(def: Def, binding: ListBinding<Def, T, Row>): ListRepo<Def, Row> {
  const ops = opsOf(def);
  const filterKeys = ops.availableFilters();
  const sortColumns: Record<string, AnyColumn> = {};
  const sortKeys: Record<string, AnyColumn | SQL> = {};
  // Erased views of the typed maps, for the loops below.
  const sorts: Readonly<Partial<Record<string, SortBinding<T, unknown>>>> =
    binding.sorts;
  const labels: Readonly<Partial<Record<string, AnyColumn>>> =
    binding.searchLabels ?? {};
  for (const key of Object.keys(def.sorts)) {
    const sort = sorts[key];
    if (sort === undefined) throw new Error(`${def.name}: no sort ${key}`);
    if (isNullableSort(sort)) {
      sortColumns[key] = sort.column;
      sortKeys[key] = sortKeyExpr(sort.column, sortSentinel(sort.nullsAs));
    } else {
      sortColumns[key] = sort;
      sortKeys[key] = sort;
    }
  }
  const searchColumns: readonly AnyColumn[] =
    binding.search === undefined ? [] : Object.values(binding.search);
  const labelColumns: (readonly [string, AnyColumn])[] = [];
  for (const [key, column] of Object.entries(labels)) {
    if (column !== undefined) labelColumns.push([key, column]);
  }

  const orderOf = (sort: ListQuery<Def>["sort"]): KeysetOrder => {
    const { key, dir, type } = ops.sortParts(sort);
    const sortKey = sortKeys[key];
    if (sortKey === undefined) throw new Error(`${def.name}: no sort ${key}`);
    return { idColumn: binding.id, key: sortKey, isTime: type === "time", dir };
  };

  const filterOn = <K extends FilterKey<Def>>(
    key: K,
    value: ListQuery<Def>["filters"][K]
  ): SQL | undefined => binding.filters[key](value);

  const labelMatches = (q: string): SQL[] =>
    labelColumns.flatMap(([key, column]) => {
      const filter = def.filters[key];
      if (filter?.kind !== "choices") return [];
      const match = inArrayForDisplayLabelMatch(
        column,
        filter.values,
        filter.optionLabels,
        q
      );
      return match === undefined ? [] : [match];
    });

  const searchOn = (q: string | null): SQL | undefined => {
    if (q === null) return undefined;
    const pattern = containsPattern(q);
    if (pattern === null) return undefined;
    return or(
      ...searchColumns.map((column) => ilike(column, pattern)),
      ...labelMatches(q)
    );
  };

  /** Scope, every filter and `q`: the set a page walks and the count counts. */
  const matching = (
    scope: ListScope<Def>,
    query: ListQuery<Def>
  ): SQL | undefined =>
    and(
      binding.scope(scope),
      ...filterKeys.map((key) => filterOn(key, query.filters[key])),
      searchOn(query.q)
    );

  const defaultOrder = orderOf(ops.queryOf({}).sort);

  return {
    def,
    async page(exec, scope, query, window) {
      const order = orderOf(query.sort);
      return binding
        .base(exec, keysetKey(order))
        .where(and(matching(scope, query), keysetWhere(order, window.after)))
        .orderBy(...keysetOrderBy(order))
        .limit(window.limit);
    },
    async countCapped(exec, scope, query, cap) {
      const table: PgTable = binding.table;
      const capped = exec
        .select({ one: sql`1` })
        .from(table)
        .where(matching(scope, query))
        .limit(cap + 1)
        .as("capped");
      const [row] = await exec.select({ n: count() }).from(capped);
      return row?.n ?? 0;
    },
    async byIds(exec, scope, ids) {
      const wanted = normalizeUuidList(ids).slice(0, ARRAY_MAX);
      if (wanted.length === 0) return [];
      return binding
        .base(exec, keysetKey(defaultOrder))
        .where(and(binding.scope(scope), inArray(binding.id, wanted)))
        .orderBy(...keysetOrderBy(defaultOrder));
    },
    indexNeeds: {
      table: getTableName(binding.table),
      scopeColumn: binding.scopeColumn.name,
      sortColumns: Object.fromEntries(
        Object.entries(sortColumns).map(([key, column]) => [key, column.name])
      ),
      selectiveColumns: Object.fromEntries(
        Object.entries(binding.selective ?? {}).flatMap(([key, column]) =>
          column === undefined ? [] : [[key, column.name]]
        )
      ),
      searchColumns: searchColumns.map((column) => column.name),
    },
  };
}
