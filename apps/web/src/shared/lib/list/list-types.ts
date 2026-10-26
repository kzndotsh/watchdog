import type {
  AnyListDef,
  FilterKey,
  FixedFilters,
  ListQuery,
  ListTotal,
  QueryValue,
  SortValue,
  UnfixedSearch,
  UnfixedSearchPatch,
} from "@watchdog/schemas/shared";

/**
 * The state of one list view, in the order every list body checks it (loading.md rule 5):
 *   pending   first load: the skeleton (never on error, never while the previous view's rows stand in)
 *   error     the first load failed: the alert and Retry in the body's footprint
 *   blank     settled, no rows, nothing filtered: "No <noun> yet" + the screen's add action
 *   no-match  settled, no rows, filtered or searched: "Nothing matches these filters" + Clear filters
 *   ready     rows
 */
export type ListStatus = "pending" | "error" | "blank" | "no-match" | "ready";

export type ListCountValue = {
  readonly loaded: number;
  /** The capped total from the first page; null while it is unknown. */
  readonly total: ListTotal | null;
  readonly hasMore: boolean;
  /** `LIST_MAX_PAGES` pages are loaded and more remain: narrow the filters instead of Load more. */
  readonly isAtCeiling: boolean;
  /** The current view's first page has landed (not pending, not the previous view's rows). */
  readonly isSettled: boolean;
};

/** What a screen passes to `useList`. A fixed filter is in the query and key, never in the URL. */
export type UseListArgs<
  D extends AnyListDef,
  Scope,
  K extends FilterKey<D> = never,
> = {
  readonly scope: Scope;
  /**
   * Sub-scope (the Dossier tab's `entityId`): never a chip, never cleared, never in the URL.
   * `K` is inferred from this alone (`NoInfer` elsewhere), so a screen without it fixes nothing.
   */
  readonly fixed?: Pick<FixedFilters<D>, K>;
  /** The route's validated search (`def.searchWith`); route-only params such as `id` are ignored. */
  readonly search: UnfixedSearch<D, NoInfer<K>>;
  /** The route's `usePatchSearch` writer (a history replace). */
  readonly onSearchChange: (patch: UnfixedSearchPatch<D, NoInfer<K>>) => void;
  /** Load failure copy; `couldnt("load", def.noun.many)` when omitted. */
  readonly errorCopy?: string;
};

export type ListControls<D extends AnyListDef> = {
  /** The search box text: the source of truth while the box has focus. */
  readonly draftQ: string;
  readonly setDraftQ: (text: string) => void;
  /** The box gained or lost focus; on blur a pending search is written at once. */
  readonly setSearchFocused: (isFocused: boolean) => void;
  /** Escape in the box: empty it and drop `q` at once. */
  readonly clearSearch: () => void;
  /** The filters the Filters popover may offer: not fixed, not locked by a fixed partner. */
  readonly availableFilters: readonly FilterKey<D>[];
  /** Applies `def.withFilter` (exclusive partners removed) as one URL replace. */
  readonly setFilter: <K extends FilterKey<D>>(
    key: K,
    value: QueryValue<D["filters"][K]>
  ) => void;
  /** Back to the filter's empty value (a chip's ×, a popover row's remove). */
  readonly removeFilter: (key: FilterKey<D>) => void;
  readonly setSort: (sort: SortValue<D>) => void;
  /** Every non-fixed filter and `q` cleared, sort kept: "Clear all" and "Clear filters". */
  readonly reset: () => void;
};

export type ListSelectionState = {
  readonly ids: ReadonlySet<string>;
  readonly toggle: (id: string) => void;
  readonly setIds: (ids: ReadonlySet<string>) => void;
  readonly clear: () => void;
};

/** The paging handle `LoadMore` takes. */
export type ListMore = {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly fetchNextPage: () => Promise<unknown>;
};

/** What `useList` returns: everything a toolbar, body, table and footer read. */
export type ListHandle<
  D extends AnyListDef,
  Item,
  K extends FilterKey<D> = never,
> = {
  readonly def: D;
  readonly fixed: Pick<FixedFilters<D>, K> | undefined;
  readonly query: ListQuery<D>;
  /** `def.keyOf(query)`: the selection key and the Query key tail. */
  readonly viewKey: string;
  readonly isFiltered: boolean;
  readonly rows: readonly Item[];
  readonly getId: (item: Item) => string;
  readonly status: ListStatus;
  /** The previous view's rows stand in while the new one loads: de-emphasise them. */
  readonly isUpdating: boolean;
  /** The first load failed (status `error`), or a refresh failed with rows kept. */
  readonly error: string | null;
  readonly retry: () => void;
  readonly count: ListCountValue;
  readonly more: ListMore;
  readonly controls: ListControls<D>;
  /** Ids only, keyed by the view: a new filter, search or sort clears it. */
  readonly selection: ListSelectionState;
};

/** One option of a `ref` or `tags` filter row. */
export type ListOption = {
  readonly value: string;
  readonly label: string;
};

/**
 * What a `ref` filter needs from the screen: a picker searched on the server, and the selected
 * record's title (chips and the row value), even when it is not among the loaded options.
 * Built by a domain hook such as `useEntityRefSource(caseId, selectedId)`.
 */
export type ListRefSource = {
  readonly kind: "ref";
  /** The picker's typed text (the hook debounces it into its query). */
  readonly text: string;
  readonly onTextChange: (text: string) => void;
  readonly options: readonly ListOption[];
  readonly isPending: boolean;
  /** The selected id's title (get-by-ids, enabled only with an id); null while unknown. */
  readonly selected: ListOption | null;
};

/** What a `tags` filter needs from the screen: its open vocabulary (the Cap catalog). */
export type ListTagSource = {
  readonly kind: "tags";
  readonly options: readonly ListOption[];
};

/** Filters whose options come from the screen at runtime (`ref`, `tags`). */
export type SourcedFilterKey<D extends AnyListDef> = {
  [P in FilterKey<D>]: D["filters"][P] extends {
    readonly kind: "ref" | "tags";
  }
    ? P
    : never;
}[FilterKey<D>];

/**
 * The option source of every `ref` / `tags` filter the screen leaves unfixed: required, so a
 * missing picker is a compile error. Fixed filters (`K`) need none: they are never offered.
 */
export type ListFilterSources<
  D extends AnyListDef,
  K extends FilterKey<D> = never,
> = {
  readonly [P in Exclude<SourcedFilterKey<D>, K>]: D["filters"][P] extends {
    readonly kind: "ref";
  }
    ? ListRefSource
    : ListTagSource;
};

/** The erased view generic components read a source through. */
export type AnyFilterSource = ListRefSource | ListTagSource;
