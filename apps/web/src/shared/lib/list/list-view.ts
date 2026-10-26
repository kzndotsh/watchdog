import {
  infiniteQueryOptions,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

import { placeholderDataForScope } from "@/shared/lib/query-placeholder";
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
 * What a list's ServerFn receives for one page: the scope, the list params of the canonical
 * query (`def.toSearch(query)` without fixed filters, so the wire carries every filter) and the
 * cursor. The domain spreads `params` into its oRPC input next to the scope ids.
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
 * Keys are `[domain, ...scopeKey(scope), "list", def.name, def.keyOf(query)]`. The
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

type ListViewOptions<D extends AnyListDef, Scope, Item> = {
  /** The domain's key root (`"evidence"`): the first segment every key of the domain shares. */
  readonly domain: string;
  /** Scope ids after the root (`[caseId]`); empty when the scope is not ready yet. */
  readonly scopeKey: (scope: Scope) => readonly string[];
  /** False while the scope is incomplete (no Case yet): the query does not run. */
  readonly isScopeReady?: (scope: Scope) => boolean;
  readonly fetchPage: (
    request: ListPageRequest<D, Scope>
  ) => Promise<ListPage<Item>>;
  readonly getId: (item: Item) => string;
  readonly staleTime: number;
  readonly gcTime: number;
};

/** The page after `pages`, or undefined at the last page and at the `LIST_MAX_PAGES` ceiling. */
export function nextListCursor<Item>(
  last: ListPage<Item>,
  pages: readonly ListPage<Item>[]
): string | undefined {
  if (pages.length >= LIST_MAX_PAGES) return undefined;
  return last.nextCursor ?? undefined;
}

function startsWithKey(
  key: readonly unknown[] | undefined,
  prefix: readonly unknown[]
): boolean {
  return (
    key !== undefined &&
    key.length >= prefix.length &&
    prefix.every((part, index) => part === key[index])
  );
}

function listInfiniteOptions<Item>(opts: {
  readonly queryKey: QueryKey;
  readonly prefix: QueryKey;
  readonly fetch: (cursor: string | undefined) => Promise<ListPage<Item>>;
  readonly isEnabled: boolean;
  readonly staleTime: number;
  readonly gcTime: number;
}) {
  return infiniteQueryOptions({
    queryKey: opts.queryKey,
    queryFn: async ({ pageParam }) => opts.fetch(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: ListPage<Item>, pages: ListPage<Item>[]) =>
      nextListCursor(last, pages),
    enabled: opts.isEnabled,
    staleTime: opts.staleTime,
    gcTime: opts.gcTime,
    meta: { isListView: true },
    // A new filter, search or sort keeps the previous view's rows (de-emphasised) until the
    // new first page lands; another list or scope never lends its rows.
    placeholderData: placeholderDataForScope<ListPages<Item>>((previous) =>
      startsWithKey(previous?.queryKey, opts.prefix)
    ),
  });
}

export function listView<D extends AnyListDef, Scope, Item>(
  def: D,
  opts: ListViewOptions<D, Scope, Item>
): ListView<D, Scope, Item> {
  const ops = opsOf(def);
  const prefix = (scope: Scope): QueryKey => [
    opts.domain,
    ...opts.scopeKey(scope),
    "list",
    def.name,
  ];
  const key = (scope: Scope, query: ListQuery<D>): QueryKey => [
    ...prefix(scope),
    ops.keyOf(query),
  ];
  const infinite = (scope: Scope, query: ListQuery<D>) =>
    listInfiniteOptions<Item>({
      queryKey: key(scope, query),
      prefix: prefix(scope),
      fetch: async (cursor) =>
        opts.fetchPage({ scope, params: ops.toSearch(query), cursor }),
      isEnabled: opts.isScopeReady?.(scope) ?? true,
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
