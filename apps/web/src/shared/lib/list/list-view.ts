import {
  hashKey,
  infiniteQueryOptions,
  keepPreviousData,
  partialMatchKey,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

import {
  isListViewReset,
  isStaleCursorError,
  ListViewResetError,
} from "@/shared/lib/list/list-status";
import { warmEnsureInfiniteQueryData } from "@/shared/lib/warm-query";
import {
  LIST_MAX_PAGES,
  opsOf,
  type AnyListDef,
  type ListPage,
  type ListQuery,
  type UnfixedSearchPatch,
} from "@watchdog/schemas/shared";

/** The pages of one list view as the Query cache holds them. */
export type ListPages<Item> = InfiniteData<ListPage<Item>, string | undefined>;

/**
 * What a list's page fetch (its procedure input, or its ServerFn) receives for one page: the
 * scope, the list params of the canonical query (`def.toSearch(query)` without fixed filters,
 * so the wire carries every filter) and the cursor. The domain spreads `params` into its oRPC
 * input next to the scope ids.
 */
export type ListPageRequest<D extends AnyListDef, Scope> = {
  readonly scope: Scope;
  readonly params: UnfixedSearchPatch<D, never>;
  readonly cursor: string | undefined;
};

/**
 * A declared list bound to its domain's cache and ServerFn: the web half of a list's identity.
 * Built once in the domain's `queries.ts` (the only module that owns Query keys), consumed by
 * `useList` and the route loader's warm.
 *
 * Keys are the procedure's (`[path, { input, type: "infinite" }]`) for a list read through oRPC,
 * otherwise `[domain, ...scopeKey(scope), "list", def.name, def.keyOf(query)]`. The
 * `[domain, ...scope]` prefix is what the invalidation contracts already name
 * (`evidenceKeys.all(caseId)`), so SSE and mutations refresh every view of the list without
 * knowing its filters, and `softInvalidate` throttles the refetch per view (`meta.isListView`).
 */
export type ListView<D extends AnyListDef, Scope, Item> = {
  readonly def: D;
  /** Table `getRowId`, selection ids, React keys. */
  readonly getId: (item: Item) => string;
  /** Every view of this list in this scope. */
  readonly prefix: (scope: Scope) => QueryKey;
  readonly key: (scope: Scope, query: ListQuery<D>) => QueryKey;
  readonly infinite: (
    scope: Scope,
    query: ListQuery<D>
  ) => ReturnType<typeof listInfiniteOptions<Item>>;
  /** Loader warm: the first page, in the browser only. */
  readonly warm: (
    client: QueryClient,
    scope: Scope,
    query: ListQuery<D>
  ) => void;
};

/**
 * A list procedure as the oRPC TanStack Query utils expose it (`orpc.claims.list`): the call and
 * the keys, `[path, { input, type }]`.
 */
export type ListProcedure<Input, Item> = {
  readonly call: (input: Input) => Promise<ListPage<Item>>;
  readonly key: (options: {
    readonly type: "infinite";
    readonly input: Partial<Input>;
  }) => QueryKey;
  readonly infiniteKey: (options: {
    readonly input: (cursor: string | undefined) => Input;
    readonly initialPageParam: string | undefined;
  }) => QueryKey;
};

/** A list read through a ServerFn, keyed under the domain's own key root. */
type ServerFnListSource<D extends AnyListDef, Scope, Item> = {
  /** The domain's key root (`"evidence"`): the first segment every key of the domain shares. */
  readonly domain: string;
  /** Scope ids after the root (`[caseId]`); empty when the scope is not ready yet. */
  readonly scopeKey: (scope: Scope) => readonly string[];
  readonly fetchPage: (
    request: ListPageRequest<D, Scope>
  ) => Promise<ListPage<Item>>;
};

/**
 * A list read through its oRPC procedure (`orpc.claims.list`), keyed by the procedure's path and
 * input: a view is `procedure.infiniteKey`, and every view of a scope is the partial key
 * `procedure.key({ input: scopeInput(scope) })`, which the domain's `key({ input: { caseId } })`
 * covers.
 */
type ProcedureListSource<D extends AnyListDef, Scope, Item, Input> = {
  readonly procedure: ListProcedure<Input, Item>;
  /** The procedure's input for one page: the scope ids, `params` and the cursor. */
  readonly input: (request: ListPageRequest<D, Scope>) => Input;
  /** The scope part of the input (`{ caseId }`): what every view of the scope shares. */
  readonly scopeInput: (scope: Scope) => Partial<Input>;
};

type ListViewOptions<D extends AnyListDef, Scope, Item, Input> = (
  | ServerFnListSource<D, Scope, Item>
  | ProcedureListSource<D, Scope, Item, Input>
) & {
  /** False while the scope is incomplete (no Case yet): the query does not run. */
  readonly isScopeReady?: (scope: Scope) => boolean;
  readonly getId: (item: Item) => string;
  readonly staleTime: number;
  readonly gcTime: number;
  /**
   * Pages one view may load; default `LIST_MAX_PAGES`. A feed that has always paged to the end
   * (Recent activity: read-only, no selection, a few lines a row) passes `Infinity`.
   */
  readonly maxPages?: number;
};

/** Views reset after a stale cursor, per client, until their page one loads again. */
const resetViewsByClient = new WeakMap<QueryClient, Set<string>>();

function resetViewsOf(client: QueryClient): Set<string> {
  let views = resetViewsByClient.get(client);
  if (views === undefined) {
    views = new Set();
    resetViewsByClient.set(client, views);
  }
  return views;
}

/** The page after `pages`, or undefined at the last page and at the `LIST_MAX_PAGES` ceiling. */
export function nextListCursor<Item>(
  last: ListPage<Item>,
  pages: readonly ListPage<Item>[],
  maxPages: number = LIST_MAX_PAGES
): string | undefined {
  if (pages.length >= maxPages) return undefined;
  return last.nextCursor ?? undefined;
}

function listInfiniteOptions<Item>(opts: {
  readonly queryKey: QueryKey;
  readonly prefix: QueryKey;
  /** Which rows the view holds, whatever their order: its filters and search, not its sort. */
  readonly rowsKey: string;
  readonly fetch: (cursor: string | undefined) => Promise<ListPage<Item>>;
  readonly isEnabled: boolean;
  readonly staleTime: number;
  readonly gcTime: number;
  readonly maxPages: number;
}) {
  return infiniteQueryOptions({
    queryKey: opts.queryKey,
    queryFn: async ({ pageParam, client, queryKey }) => {
      const resets = resetViewsOf(client);
      const hash = hashKey(queryKey);
      try {
        const page = await opts.fetch(pageParam);
        // Page one loaded: a later stale cursor may reset this view again.
        if (pageParam === undefined) resets.delete(hash);
        return page;
      } catch (error) {
        if (!isStaleCursorError(error) || resets.has(hash)) throw error;
        resets.add(hash);
        throw new ListViewResetError(error);
      }
    },
    // A stale cursor is never retried: it resets the view (once) or is the error.
    retry: (failureCount: number, error: Error) =>
      failureCount < 1 && !isStaleCursorError(error) && !isListViewReset(error),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ListPage<Item>, pages: ListPage<Item>[]) =>
      nextListCursor(last, pages, opts.maxPages),
    enabled: opts.isEnabled,
    staleTime: opts.staleTime,
    gcTime: opts.gcTime,
    meta: { isListView: true, rowsKey: opts.rowsKey },
    // A new filter, search or sort keeps the previous view's rows (de-emphasised) until the
    // new first page lands; another list or scope never lends its rows. An empty view stands in
    // only for a new sort of the same rows, which is empty too: before another filter's first
    // page lands, the list is pending, never "Nothing matches".
    placeholderData: (previousData, previousQuery) => {
      const isSameList =
        previousQuery !== undefined &&
        partialMatchKey(previousQuery.queryKey, opts.prefix);
      const isEmpty = (previousData?.pages ?? []).every(
        (page) => page.items.length === 0
      );
      const isSameRows = previousQuery?.meta?.rowsKey === opts.rowsKey;
      return isSameList && (!isEmpty || isSameRows)
        ? keepPreviousData(previousData)
        : undefined;
    },
  });
}

/** A view's keys and page fetch, from its oRPC procedure or its ServerFn. */
function listSource<D extends AnyListDef, Scope, Item, Input>(
  def: D,
  opts: ListViewOptions<D, Scope, Item, Input>
) {
  const ops = opsOf(def);
  if ("procedure" in opts) {
    const { procedure, input, scopeInput } = opts;
    return {
      prefix: (scope: Scope): QueryKey =>
        procedure.key({ type: "infinite", input: scopeInput(scope) }),
      key: (scope: Scope, query: ListQuery<D>): QueryKey => {
        const params = ops.toSearch(query);
        return procedure.infiniteKey({
          input: (cursor) => input({ scope, params, cursor }),
          initialPageParam: undefined,
        });
      },
      fetchPage: async (request: ListPageRequest<D, Scope>) =>
        procedure.call(input(request)),
    };
  }
  const prefix = (scope: Scope): QueryKey => [
    opts.domain,
    ...opts.scopeKey(scope),
    "list",
    def.name,
  ];
  return {
    prefix,
    key: (scope: Scope, query: ListQuery<D>): QueryKey => [
      ...prefix(scope),
      ops.keyOf(query),
    ],
    fetchPage: opts.fetchPage,
  };
}

export function listView<D extends AnyListDef, Scope, Item, Input = never>(
  def: D,
  opts: ListViewOptions<D, Scope, Item, Input>
): ListView<D, Scope, Item> {
  const ops = opsOf(def);
  const { prefix, key, fetchPage } = listSource(def, opts);
  const infinite = (scope: Scope, query: ListQuery<D>) =>
    listInfiniteOptions<Item>({
      queryKey: key(scope, query),
      prefix: prefix(scope),
      rowsKey: hashKey([query.filters, query.q]),
      fetch: async (cursor) =>
        fetchPage({ scope, params: ops.toSearch(query), cursor }),
      isEnabled: opts.isScopeReady?.(scope) ?? true,
      maxPages: opts.maxPages ?? LIST_MAX_PAGES,
      staleTime: opts.staleTime,
      gcTime: opts.gcTime,
    });
  return {
    def,
    getId: opts.getId,
    prefix,
    key,
    infinite,
    warm: (client, scope, query) => {
      warmEnsureInfiniteQueryData(client, infinite(scope, query));
    },
  };
}
