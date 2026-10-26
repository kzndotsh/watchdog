import type { z } from "zod";

import { buildListApi } from "./build-list-api";
import type { AnyFilter, QueryValue, WireValue } from "./filter-kinds";

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
  /**
   * The key moves while a view is open (Collect's `activity`: a row rises when its Job finishes).
   * Only `desc` is offered (a moving key has no stable ascending walk), and a view that pages
   * it keeps the first occurrence of an id, since a row that drops past the cursor comes back.
   */
  readonly moving?: boolean;
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
  /**
   * Scope the server supplies from the caller, never on the wire, in the input or in a URL: an
   * organization-wide list (Deleted Cases) has an empty `scope` and `{ organizationId }` here.
   * Core authorises it and passes it with the wire scope; it is part of the fingerprint.
   */
  readonly context?: z.ZodObject;
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
export type ScopeKey<D extends ListDecl> = Extract<keyof ListScope<D>, string>;

/**
 * An object schema's value type, or nothing for an empty one: `z.object({})` outputs
 * `Record<string, never>`, whose index signature would turn every key it is intersected with
 * into `never` (an organization-wide list has an empty wire scope).
 */
type ShapeOrNothing<T> = string extends keyof T ? unknown : T;

/** The server-supplied part of a list's scope (`context`); nothing for a list without one. */
type ContextOf<D extends ListDecl> = D extends {
  readonly context: infer C extends z.ZodObject;
}
  ? z.output<C>
  : unknown;

/**
 * The validated scope a list is read in (`{ caseId }`, or `{ organizationId }` through
 * `context`): what core authorises and db binds.
 */
export type ListScope<D extends ListDecl> = ShapeOrNothing<
  z.output<D["scope"]>
> &
  ContextOf<D>;

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

/** `q`, only for a list that declares `search`: a list without it takes no search text. */
export type SearchParam<D extends ListDecl> = D extends {
  readonly search: object;
}
  ? { readonly q?: string }
  : unknown;

/** Server side of `def.input` (after defaults): what the procedure and core receive. */
export type ListInput<D extends ListDecl> = ShapeOrNothing<
  z.output<D["scope"]>
> &
  WireFilters<D> &
  SearchParam<D> & {
    readonly sort?: SortValue<D>;
    readonly cursor?: string;
    readonly limit: number;
  };

/** Client side of `def.input`: what the oRPC client, the ServerFn and the CLI send. */
export type ListWireInput<D extends ListDecl> = ShapeOrNothing<
  z.input<D["scope"]>
> &
  WireFilters<D> &
  SearchParam<D> & {
    readonly sort?: SortValue<D>;
    readonly cursor?: string;
    readonly limit?: number;
  };

/** The URL's view: every list param optional (a bad value is `.catch`ed away). */
export type ListSearch<D extends ListDecl> = WireFilters<D> &
  SearchParam<D> & {
    readonly sort?: SortValue<D>;
  };

/** Every param a list owns: a route's own search params may not reuse one. */
export type ListParam<D extends ListDecl> = FilterKey<D> | ReservedParam;

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

/**
 * A route's own search params as `searchWith` merges them: an empty shape adds nothing. Not
 * `z.output<z.ZodObject<{}>>`, which is `Record<string, never>`: that index signature would turn
 * every key a route merges into the search type into `never`.
 */
type RouteSearchOutput<E extends z.ZodRawShape> = keyof E extends never
  ? unknown
  : z.output<z.ZodObject<E>>;

/** The input side of `RouteSearchOutput`. */
type RouteSearchInput<E extends z.ZodRawShape> = keyof E extends never
  ? unknown
  : z.input<z.ZodObject<E>>;

export type ListDefApi<D extends ListDecl> = {
  /** oRPC input, typed at BOTH ends. */
  readonly input: z.ZodType<ListInput<D>, ListWireInput<D>>;
  /**
   * The route's `validateSearch`: the list params (a bad value and a short `q` dropped) plus
   * the route's own, which may not reuse a list param (a compile error, and a throw).
   * Output is exactly `ListSearch<D> & extra`, and `searchWith({})` exactly `ListSearch<D>`.
   */
  readonly searchWith: <E extends z.ZodRawShape>(
    extra: E & Readonly<Partial<Record<ListParam<D>, never>>>
  ) => z.ZodType<
    ListSearch<D> & RouteSearchOutput<E>,
    ListSearch<D> & RouteSearchInput<E>
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
  readonly isFiltered: <F extends FilterKey<D> = never>(
    query: ListQuery<D>,
    fixed?: Pick<FixedFilters<D>, F>
  ) => boolean;
  /**
   * Set one filter, removing its non-fixed `exclusive` partners. The only way UI changes a
   * filter. A fixed filter never changes: setting it, or setting a filter exclusive with an
   * active fixed one, returns the query unchanged.
   */
  readonly withFilter: <K extends FilterKey<D>, F extends FilterKey<D> = never>(
    query: ListQuery<D>,
    key: K,
    value: QueryValue<D["filters"][K]>,
    fixed?: Pick<FixedFilters<D>, F>
  ) => ListQuery<D>;
  /**
   * The filters a screen may offer (the Filters popover), in declaration order: not fixed,
   * and not exclusive with an active fixed filter.
   *
   * Like `queryOf`, the functions that take `fixed` are generic over its keys, so generic code
   * holding a screen's `Pick<FixedFilters<D>, K>` passes it on without widening it.
   */
  readonly availableFilters: <F extends FilterKey<D> = never>(
    fixed?: Pick<FixedFilters<D>, F>
  ) => readonly FilterKey<D>[];
  /** Every non-fixed filter and `q` cleared, the fixed ones kept, sort kept. */
  readonly cleared: <F extends FilterKey<D> = never>(
    query: ListQuery<D>,
    fixed?: Pick<FixedFilters<D>, F>
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
  readonly withFilter: (
    query: never,
    key: never,
    value: never,
    fixed?: never
  ) => unknown;
  readonly availableFilters: (fixed?: never) => readonly string[];
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
  /** Each direction at most once; a `moving` key offers `desc` only. */
  readonly sorts: {
    readonly [K in keyof D["sorts"]]: D["sorts"][K] extends {
      readonly moving: true;
    }
      ? { readonly dirs: readonly ["desc"] }
      : { readonly dirs: ValidDirs };
  };
};

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
