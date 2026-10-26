import { z } from "zod";

import { NAME_MAX } from "../limits";
import {
  PAGE_LIMIT_DEFAULT,
  PAGE_LIMIT_MAX,
  pageInputFields,
} from "../pagination";
import {
  canonicalFilterValue,
  emptyFilterValue,
  isActiveFilterValue,
  urlParam,
} from "./filter-kinds";
import type { AnyFilter, QueryValue, WireValue } from "./filter-kinds";
import { LIST_SEARCH_MIN_LENGTH, LIST_TOTAL_CAP } from "./list-page";

/**
 * One declaration per list (ADR-0007): data plus the pure functions every surface shares. No
 * SQL (db binds it), no React (web renders it), no argv (the CLI reads it). Each list's
 * declaration lives in its domain subpath (`evidenceList` in `@watchdog/schemas/evidence`).
 *
 * Load-bearing: a request has exactly one canonical meaning, `ListQuery<D>`, and
 * `def.keyOf(query)` is the one string used as the Query key tail, the cursor fingerprint input,
 * the selection key, and (through `toSearch`) the URL. Only `defineList` canonicalises.
 *
 * Types reach both ends: `def.input` is `ZodType<ListInput<D>, ListWireInput<D>>`, so the oRPC
 * client's argument type is exact (unknown keys and bad enum values are compile errors), and
 * `def.searchWith(extra)` outputs exactly `ListSearch<D> & extra`, so `Route.useSearch()` needs
 * no cast.
 */

export type SortDir = "asc" | "desc";

/** The type of a sort column's value in the cursor. */
export type ListKeyType = "text" | "time" | "int";

/** The JS value of each key type: the db binding's column `data` and a nullable sort's sentinel must match it. */
export type KeyData = {
  readonly text: string;
  readonly time: Date;
  readonly int: number;
};

export type SortKeyDecl = {
  /** Title Case column name: "Captured", "Value". Direction words come from `type` in web. */
  readonly label: string;
  readonly type: ListKeyType;
  /** Offered directions, each once (checked by `defineList`); one btree serves both. */
  readonly dirs: readonly [SortDir, ...SortDir[]];
};

/** The direction lists `defineList` accepts: each direction at most once. */
export type ValidDirs =
  | readonly ["asc"]
  | readonly ["desc"]
  | readonly ["asc", "desc"]
  | readonly ["desc", "asc"];

/** Param names a filter or scope key may not take. */
export type ReservedParam = "q" | "sort" | "cursor" | "limit";

export type FilterMap = Readonly<Record<string, AnyFilter>>;
export type SortMap = Readonly<Record<string, SortKeyDecl>>;

/** The erased shape `defineList` accepts. */
export type ListDecl = {
  /** Cursor list name and Query key segment; unique across `LIST_DEFS` (property test). */
  readonly name: string;
  /** Empty state ("No evidence yet"), search placeholder, count label, CLI help. */
  readonly noun: { readonly one: string; readonly many: string };
  /** Scope params (`caseScopeInputSchema`); authorised by core, part of the fingerprint. */
  readonly scope: z.ZodObject;
  /** Declaration order is the Filters popover's field order. No defaults (absent = everything). */
  readonly filters: FilterMap;
  /** Filter pairs that cannot both be set. Wire: 400. UI and URL: setting one removes the other. */
  readonly exclusive?: readonly (readonly [string, string])[];
  readonly sorts: SortMap;
  readonly defaultSort: string;
  /**
   * Present when the list takes `q`. Wire: a trimmed `q` of 1–2 characters is a 400
   * (`LIST_SEARCH_MIN_LENGTH`); only the URL schema and `queryOf(search)` drop it quietly.
   */
  readonly search?: {
    readonly fields: readonly [string, ...string[]];
    /** Completes "Search …": "label, notes or URL". */
    readonly hint: string;
  };
  /** Defaults `PAGE_LIMIT_DEFAULT` / `PAGE_LIMIT_MAX`. */
  readonly limit?: { readonly default: number; readonly max: number };
  /** Defaults `LIST_TOTAL_CAP`. */
  readonly totalCap?: number;
};

export type FilterKey<D extends ListDecl> = Extract<keyof D["filters"], string>;
export type SortKey<D extends ListDecl> = Extract<keyof D["sorts"], string>;
export type ScopeKey<D extends ListDecl> = Extract<
  keyof z.output<D["scope"]>,
  string
>;

/** `"captured.desc"`: only declared key and direction pairs. */
export type SortValueOf<S extends SortMap> = {
  [K in Extract<keyof S, string>]: `${K}.${S[K]["dirs"][number]}`;
}[Extract<keyof S, string>];
export type SortValue<D extends ListDecl> = SortValueOf<D["sorts"]>;

/** Canonical filter values (flags are booleans here; absent = false). */
export type ListFilters<D extends ListDecl> = {
  readonly [K in FilterKey<D>]: QueryValue<D["filters"][K]>;
};

/** Wire / URL filter params: each optional; flags only ever `true`. */
export type WireFilters<D extends ListDecl> = {
  readonly [K in FilterKey<D>]?: WireValue<D["filters"][K]>;
};

export type ListQuery<D extends ListDecl> = {
  readonly filters: ListFilters<D>;
  /** Trimmed; null when absent. */
  readonly q: string | null;
  readonly sort: SortValue<D>;
};

/** Server side of `def.input` (after defaults): what the procedure and core receive. */
export type ListInput<D extends ListDecl> = z.output<D["scope"]> &
  WireFilters<D> & {
    readonly q?: string;
    readonly sort?: SortValue<D>;
    readonly cursor?: string;
    readonly limit: number;
  };

/** Client side of `def.input`: what the oRPC client, the ServerFn and the CLI send. */
export type ListWireInput<D extends ListDecl> = z.input<D["scope"]> &
  WireFilters<D> & {
    readonly q?: string;
    readonly sort?: SortValue<D>;
    readonly cursor?: string;
    readonly limit?: number;
  };

/** The URL's view: every list param optional (a bad value is `.catch`ed away). */
export type ListSearch<D extends ListDecl> = WireFilters<D> & {
  readonly q?: string;
  readonly sort?: SortValue<D>;
};

/** A route's patch to its list params (`undefined` removes one). */
export type ListSearchPatch<D extends ListDecl> = {
  readonly [K in keyof ListSearch<D>]?: ListSearch<D>[K] | undefined;
};

/** Filters a screen fixes (Dossier: `entityId`): in the query and key, never in the URL. */
export type FixedFilters<D extends ListDecl> = WireFilters<D>;

/** The URL search of a screen that fixes the filters `K`: a fixed filter may not also come from the URL. */
export type UnfixedSearch<
  D extends ListDecl,
  K extends PropertyKey,
> = ListSearch<D> & Readonly<Partial<Record<K, never>>>;

/** The URL patch of a screen that fixes the filters `K`: a fixed filter is never written to the URL. */
export type UnfixedSearchPatch<
  D extends ListDecl,
  K extends PropertyKey,
> = Omit<ListSearchPatch<D>, K>;

export type ListDefApi<D extends ListDecl> = {
  /** oRPC input, typed at BOTH ends. */
  readonly input: z.ZodType<ListInput<D>, ListWireInput<D>>;
  /**
   * The route's `validateSearch`: the list params (a bad value and a short `q` dropped) plus
   * the route's own. Output is exactly `ListSearch<D> & extra`.
   */
  readonly searchWith: <E extends z.ZodRawShape>(
    extra: E
  ) => z.ZodType<
    ListSearch<D> & z.output<z.ZodObject<E>>,
    ListSearch<D> & z.input<z.ZodObject<E>>
  >;
  /**
   * URL search (or a validated input) + fixed filters → canonical. A short `q` is dropped here.
   * `K` is inferred from `fixed` only (`NoInfer`), never from the URL keys.
   */
  readonly queryOf: <K extends FilterKey<D> = never>(
    from: UnfixedSearch<D, NoInfer<K>>,
    fixed?: Pick<FixedFilters<D>, K>
  ) => ListQuery<D>;
  readonly keyOf: (query: ListQuery<D>) => string;
  /** The URL patch: fixed filters left out, empty values `undefined`, the default sort `undefined`. */
  readonly toSearch: <K extends FilterKey<D> = never>(
    query: ListQuery<D>,
    fixed?: Pick<FixedFilters<D>, K>
  ) => UnfixedSearchPatch<D, K>;
  /** Any NON-FIXED filter set, or a `q`: "Nothing matches these filters" rather than "No x yet". */
  readonly isFiltered: (
    query: ListQuery<D>,
    fixed?: FixedFilters<D>
  ) => boolean;
  /** Set one filter, removing its `exclusive` partners. The only way UI changes a filter. */
  readonly withFilter: <K extends FilterKey<D>>(
    query: ListQuery<D>,
    key: K,
    value: QueryValue<D["filters"][K]>
  ) => ListQuery<D>;
  /** Every non-fixed filter and `q` cleared, sort kept. */
  readonly cleared: (
    query: ListQuery<D>,
    fixed?: FixedFilters<D>
  ) => ListQuery<D>;
  readonly sortParts: (sort: SortValue<D>) => {
    readonly key: SortKey<D>;
    readonly dir: SortDir;
    readonly type: ListKeyType;
  };
  readonly pageLimit: { readonly default: number; readonly max: number };
  readonly totalCap: number;
};

export type ListDef<D extends ListDecl> = D & ListDefApi<D>;

/**
 * Any declared list: registries, the conformance harness, generic machinery. ERASED, not
 * `ListDef<ListDecl>`: that instance makes `ListInput<ListDecl>` demand that `limit` fit the
 * filter index signature, so no real list would be assignable. Functions take `never`, so every
 * concrete one is assignable. Generic bodies call them through `opsOf(def)`.
 */
export type AnyListDef = ListDecl & {
  readonly input: z.ZodType;
  readonly searchWith: (extra: never) => z.ZodType;
  readonly queryOf: (from: never, fixed?: never) => unknown;
  readonly keyOf: (query: never) => string;
  readonly toSearch: (query: never, fixed?: never) => unknown;
  readonly isFiltered: (query: never, fixed?: never) => boolean;
  readonly withFilter: (query: never, key: never, value: never) => unknown;
  readonly cleared: (query: never, fixed?: never) => unknown;
  readonly sortParts: (sort: never) => {
    readonly key: string;
    readonly dir: SortDir;
    readonly type: ListKeyType;
  };
  readonly pageLimit: { readonly default: number; readonly max: number };
  readonly totalCap: number;
};

/**
 * The typed API of a list inside generic code (`listPageEffect`, `useList`, the harness).
 * A cast at the erased boundary: `Def` came from `defineList`, so it is `ListDef<Def>`;
 * `AnyListDef` only forgets that to stay assignable.
 */
export function opsOf<Def extends AnyListDef>(def: Def): ListDefApi<Def> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the erased boundary: every AnyListDef came from defineList
  return def as unknown as ListDefApi<Def>;
}

type ExclusivePair<D extends ListDecl> = {
  [A in FilterKey<D>]: readonly [A, Exclude<FilterKey<D>, A>];
}[FilterKey<D>];

/** Compile-time checks `defineList` applies on top of `ListDecl`; each errors on its own property. */
type Checked<D extends ListDecl> = {
  /** A filter may not be named like a reserved param or a scope key. */
  readonly filters: Readonly<
    Partial<Record<ReservedParam | ScopeKey<D>, never>>
  >;
  readonly scope: [Extract<ScopeKey<D>, ReservedParam>] extends [never]
    ? D["scope"]
    : { readonly __error: "scope keys may not be q, sort, cursor or limit" };
  /**
   * Valid: the declared literal itself. Invalid: the literal intersected with an error object,
   * so only this property errors (two literals would reduce the WHOLE declaration to `never`).
   */
  readonly defaultSort: D["defaultSort"] extends SortValueOf<D["sorts"]>
    ? D["defaultSort"]
    : {
        readonly __error: "defaultSort must be one of the declared sort values";
        readonly allowed: SortValueOf<D["sorts"]>;
      };
  /** Two different declared filters. */
  readonly exclusive?: readonly ExclusivePair<D>[];
  /** Each direction at most once. */
  readonly sorts: {
    readonly [K in keyof D["sorts"]]: { readonly dirs: ValidDirs };
  };
};

/** Runtime shapes, erased: `ListDefApi<D>` is the typed view of these. */
type Values = Readonly<Record<string, unknown>>;
type Query = {
  readonly filters: Values;
  readonly q: string | null;
  readonly sort: string;
};

/** The keys a screen fixes: those with a value. */
function fixedKeys(fixed: Values | undefined): Set<string> {
  return new Set(
    Object.entries(fixed ?? {})
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key)
  );
}

/** The other member of an exclusive pair, or undefined when the pair does not name `key`. */
function partnerOf(
  pair: readonly [string, string],
  key: string
): string | undefined {
  const [a, b] = pair;
  if (a === key) return b;
  return b === key ? a : undefined;
}

function buildListApi(decl: ListDecl) {
  const filters = Object.entries(decl.filters);
  const pairs = decl.exclusive ?? [];
  const sortValues = Object.entries(decl.sorts).flatMap(([key, sort]) =>
    sort.dirs.map((dir) => `${key}.${dir}`)
  );
  const [firstSort, ...otherSorts] = sortValues;
  if (firstSort === undefined || !sortValues.includes(decl.defaultSort)) {
    throw new Error(`List ${decl.name}: defaultSort must be a declared sort`);
  }
  const sortSchema = z.enum([firstSort, ...otherSorts]);
  const pageLimit = decl.limit ?? {
    default: PAGE_LIMIT_DEFAULT,
    max: PAGE_LIMIT_MAX,
  };

  const filterOf = (key: string): AnyFilter | undefined => decl.filters[key];
  const isActive = (key: string, value: unknown): boolean => {
    const filter = filterOf(key);
    return filter !== undefined && isActiveFilterValue(filter, value);
  };
  const searchText = (q: unknown): string | null => {
    const text = typeof q === "string" ? q.trim() : "";
    return decl.search !== undefined && text.length >= LIST_SEARCH_MIN_LENGTH
      ? text
      : null;
  };

  /** Wire: a trimmed `q` of 1 or 2 characters is a 400, never silently dropped. */
  const qWire = z
    .string()
    .trim()
    .max(NAME_MAX)
    .refine((q) => q === "" || q.length >= LIST_SEARCH_MIN_LENGTH, {
      message: `Search needs at least ${LIST_SEARCH_MIN_LENGTH} characters`,
    })
    .optional();
  /** URL: a bad or short `q` is dropped. */
  const qUrl = urlParam(z.string().max(NAME_MAX).optional()).transform(
    (q) => searchText(q) ?? undefined
  );

  const input = decl.scope
    .extend({
      ...Object.fromEntries(filters.map(([key, f]) => [key, f.wire])),
      ...(decl.search === undefined ? {} : { q: qWire }),
      sort: sortSchema.optional(),
      cursor: pageInputFields.cursor,
      limit: z
        .number()
        .int()
        .min(1)
        .max(pageLimit.max)
        .default(pageLimit.default),
    })
    .superRefine((value: Values, ctx) => {
      for (const [a, b] of pairs) {
        const fa = filterOf(a);
        const fb = filterOf(b);
        if (fa === undefined || fb === undefined) continue;
        if (
          isActive(a, canonicalFilterValue(fa, value[a])) &&
          isActive(b, canonicalFilterValue(fb, value[b]))
        ) {
          ctx.addIssue({
            code: "custom",
            path: [b],
            message: `${fa.label} and ${fb.label} cannot both be set`,
          });
        }
      }
    });

  const searchWith = (extra: z.ZodRawShape) =>
    z.object({
      ...Object.fromEntries(filters.map(([key, f]) => [key, f.url])),
      ...(decl.search === undefined ? {} : { q: qUrl }),
      sort: urlParam(sortSchema.optional()),
      ...extra,
    });

  /** Clears the partner of every exclusive pair that is fully set, keeping a fixed filter. */
  const resolveExclusive = (values: Values, fixed: Set<string>): Values => {
    const out: Record<string, unknown> = { ...values };
    for (const [a, b] of pairs) {
      if (!isActive(a, out[a]) || !isActive(b, out[b])) continue;
      const drop = fixed.has(b) && !fixed.has(a) ? a : b;
      const filter = filterOf(drop);
      if (filter !== undefined) out[drop] = emptyFilterValue(filter);
    }
    return out;
  };

  const queryOf = (from: Values, fixed?: Values): Query => {
    const pinned = fixedKeys(fixed);
    const values = Object.fromEntries(
      filters.map(([key, f]) => [
        key,
        canonicalFilterValue(f, pinned.has(key) ? fixed?.[key] : from[key]),
      ])
    );
    const sort =
      typeof from.sort === "string" && sortValues.includes(from.sort)
        ? from.sort
        : decl.defaultSort;
    return {
      filters: resolveExclusive(values, pinned),
      q: searchText(from.q),
      sort,
    };
  };

  const keyOf = (query: Query): string => {
    const active = filters.flatMap(([key, f]) => {
      const value = canonicalFilterValue(f, query.filters[key]);
      return isActiveFilterValue(f, value) ? [[key, value]] : [];
    });
    return JSON.stringify([query.sort, searchText(query.q), active]);
  };

  const toSearch = (query: Query, fixed?: Values): Values => {
    const pinned = fixedKeys(fixed);
    const patch: Record<string, unknown> = Object.fromEntries(
      filters
        .filter(([key]) => !pinned.has(key))
        .map(([key, f]) => {
          const value = canonicalFilterValue(f, query.filters[key]);
          if (!isActiveFilterValue(f, value)) return [key, undefined];
          return [key, f.kind === "flag" ? true : value];
        })
    );
    if (decl.search !== undefined) patch.q = query.q ?? undefined;
    patch.sort = query.sort === decl.defaultSort ? undefined : query.sort;
    return patch;
  };

  const isFiltered = (query: Query, fixed?: Values): boolean => {
    const pinned = fixedKeys(fixed);
    return (
      query.q !== null ||
      filters.some(
        ([key]) => !pinned.has(key) && isActive(key, query.filters[key])
      )
    );
  };

  const withFilter = (query: Query, key: string, value: unknown): Query => {
    const filter = filterOf(key);
    if (filter === undefined) return query;
    const next: Record<string, unknown> = {
      ...query.filters,
      [key]: canonicalFilterValue(filter, value),
    };
    if (isActive(key, next[key])) {
      for (const pair of pairs) {
        const partner = partnerOf(pair, key);
        const other = partner === undefined ? undefined : filterOf(partner);
        if (partner !== undefined && other !== undefined) {
          next[partner] = emptyFilterValue(other);
        }
      }
    }
    return { ...query, filters: next };
  };

  const cleared = (query: Query, fixed?: Values): Query => {
    const pinned = fixedKeys(fixed);
    return {
      filters: Object.fromEntries(
        filters.map(([key, f]) => [
          key,
          pinned.has(key) ? query.filters[key] : emptyFilterValue(f),
        ])
      ),
      q: null,
      sort: query.sort,
    };
  };

  const sortParts = (sort: string) => {
    const at = sort.lastIndexOf(".");
    const key = sort.slice(0, at);
    const declared = decl.sorts[key];
    if (declared === undefined || !sortValues.includes(sort)) {
      throw new Error(`List ${decl.name}: undeclared sort ${sort}`);
    }
    const dir: SortDir = sort.slice(at + 1) === "asc" ? "asc" : "desc";
    return { key, dir, type: declared.type };
  };

  return {
    input,
    searchWith,
    queryOf,
    keyOf,
    toSearch,
    isFiltered,
    withFilter,
    cleared,
    sortParts,
    pageLimit,
    totalCap: decl.totalCap ?? LIST_TOTAL_CAP,
  };
}

/** Declare a list. `const` inference keeps keys, values and sort strings literal. */
export function defineList<const D extends ListDecl>(
  decl: D & Checked<D>
): ListDef<D> {
  // The erased boundary: `buildListApi` works on `ListDecl`, and its schemas and canonical
  // functions produce exactly the shapes `ListDefApi<D>` names for this `D`.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- erased runtime API to its typed view
  const api = buildListApi(decl) as unknown as ListDefApi<D>;
  return { ...decl, ...api };
}
