# UI: loading and skeletons

This page defines skeletons, sixteen rules, route patterns, and the loading inventory.
<!-- docs:allow-length -->

## Loading skeletons

Hand-built skeleton components in [`skeletons.tsx`](../../../../apps/web/src/shared/ui/skeletons.tsx) mirror the real layout, so pending-to-loaded transitions avoid layout shift. Domains wrap **data slots only** with `PendingRegion` from [`pending-region.tsx`](../../../../apps/web/src/shared/ui/pending-region.tsx). It uses `LoadingRegion` plus a `fallback` skeleton when `loading` is true. **`DataTable` is the exception**: see [`tables.md`](tables.md); do not wrap table bodies in `PendingRegion`.

| Piece | Path |
| --- | --- |
| Gate | [`pending-region.tsx`](../../../../apps/web/src/shared/ui/pending-region.tsx): `loading` + `label` + `fallback` |
| Shapes | [`skeletons.tsx`](../../../../apps/web/src/shared/ui/skeletons.tsx): `*Skeleton` fallbacks + `*SkeletonLayout` building blocks |
| Stack tabs | [`stack-pending-fallback.tsx`](../../../../apps/web/src/shared/ui/stack-pending-fallback.tsx): `stackPendingFallback(sections?)` |
| Router floor | [`default-route-pending-shell.tsx`](../../../../apps/web/src/shared/ui/default-route-pending-shell.tsx) (`RoutePendingSkeletonLayout`: title bar + `StackBodySkeleton` sections) |

Share row counts and grid templates between live UI and skeletons through exported constants (for example, `COLLECT_QUEUE_SKELETON_ROW_COUNT`). Status-chip placeholders import `CHIP_SIZE_CLASS` from [`detail-status-chip.tsx`](../../../../apps/web/src/shared/ui/detail-status-chip.tsx) so skeleton chips match live `DetailStatusChip` height and radius. **`PendingRegion` fallbacks use `*Skeleton`;** inner blocks are `*SkeletonLayout`. For an unknown shape, use a small centered spinner (`InlineLoading`), not a misleading skeleton.

## Loading & hydration (implementation)

**SSR split:** `useSuspenseQuery` fetches during SSR and ships data in the HTML; `useQuery` returns pending on the server and fetches after hydration. Thin loaders + in-page skeletons trade a fully-populated first paint for client-navigation responsiveness: deliberate for this app.

Router: `defaultPendingMs=400`, `defaultPendingMinMs=500`, `defaultPendingComponent` (minimal shell floor), `defaultErrorComponent: RouteError` (retry via `router.invalidate()`).

### Sixteen rules

Lead with "don't skeleton at all": skeletons are the fallback of last resort ([Viget](https://www.viget.com/articles/a-bone-to-pick-with-skeleton-screens): skeletons can feel slower than blank or spinner on unfamiliar UIs; our operator-facing queues are familiar enough that shape-correct skeletons still help, but reach for less first).

#### Don't skeleton at all (14-15)

| # | Rule |
| --- | --- |
| 14 | **Skeleton is last resort.** If a lesser-but-_true_ rendering exists, show it and upgrade in place: never cover real content with a skeleton overlay. Reference: [`code-block.tsx`](../../../../apps/web/src/shared/ui/code-block.tsx) renders raw code in the same `<pre>` while shiki tokenizes; no skeleton, no layout shift. |
| 15 | **Key change = update, not new page.** Filter/sort/search transitions use `placeholderData: keepPreviousData` + subtle `isPlaceholderData` de-emphasis (`opacity-60`). Never `initialData` to fake a filtered page: that caches a guess as fetched. |

#### Shape (1, 3, 12)

| # | Rule |
| --- | --- |
| 1 | **Static shell never suspends or skeletons**: `Page`, `PageHeader`, toolbar, filter chrome, tab strip, split frame, table header + pagination, queue header. |
| 3 | **Shape parity or nothing**: skeletons inside the real container; row count / grid template from a shared constant both live + skeleton import. Median row count, not max. Unknown shape → small centred spinner. **Tables:** shape parity = `DataTable` `pending` per-cell rows under real `<colgroup>`. |
| 12 | **Hydration-safe skeletons**: no `window`, `localStorage`, `Date.now()`, or random values in skeleton output. |

#### State (4-6)

| # | Rule |
| --- | --- |
| 4 | **Keep router thresholds**: no sub-400ms skeletons (reads as glitch). |
| 5 | **Refetch ≠ pending; loading ≠ empty**: `listPending()` / `isLoading \|\| !isFetched` gates skeleton; error → error UI; empty only when settled. `isFetching` → at most soft de-emphasis ([`recent-activity.tsx`](../../../../apps/web/src/domains/dashboard/components/recent-activity.tsx) `opacity-60`). |
| 6 | **No confident wrong values**: `0` meaning "unknown" is worse than a bone; no fabricated placeholder objects in live chrome. |

#### A11y & motion (7-8)

| # | Rule |
| --- | --- |
| 7 | **One loading event, three channels**: `LoadingRegion`: `aria-busy` on region, `aria-hidden` on skeleton subtree, sibling `role="status"` sr-only label _outside_ the hidden subtree. |
| 8 | **`prefers-reduced-motion` stops animation**: in-place pulse only (`animate-pulse` on `[data-slot=skeleton]`); no travelling shimmer. |

#### Fetch discipline (2, 9-11)

| # | Rule |
| --- | --- |
| 2 | **Loaders await identity only**: `casesContextQuery` + at most one title row; lists via `warm*Queries`. |
| 9 | **>1 `useSuspenseQuery` → `useSuspenseQueries`**: serial calls waterfall on cold cache _and_ SSR TTFB; warm-helper parity is not structural. |
| 10 | **Fetch only what's visible**: no query in collapsed panels or inside `.map()`; gate artifact content on `open`. |
| 11 | **One SSE connection per case**: `useLiveEvents` ref-counts a shared `EventSource`; nested workspaces pass `live: false`. |

#### Boundaries (13, 16)

| # | Rule |
| --- | --- |
| 13 | **One pending surface per route**: `pendingComponent` _or_ in-page `RegionBoundary` + skeleton, never both for the same region. Exception: `ssr:false` / `ssr:'data-only'` routes need `pendingComponent` (or `defaultPendingComponent`). |
| 16 | **Error granularity = pending granularity**: every `RegionBoundary` gets scoped `QueryErrorResetBoundary` + `ErrorBoundary` + `Suspense`; one failed region must not blank the shell. Mutations stay on `onError` / toasts. |

### ds:check loading bans

| Ban | Use instead |
| --- | --- |
| `RoutePending` import in `routes/**` | In-page `RegionBoundary` / `PendingRegion` (`// ds:allow-route-pending` only for `ssr:false` / `defaultPendingComponent`) |
| `shadcn/skeleton` import in `domains/**` | `PendingRegion` from `@/shared/ui/pending-region` (fallback: `shared/ui/skeletons.tsx`). **Tables:** `DataTable` `pending` only: kit owns per-cell skeletons |
| `animate-pulse` outside `shared/ui/` | `Skeleton` primitive (reduced-motion guard) |
| `aria-busy` outside `shared/ui/` | `LoadingRegion` |
| `await Promise.all` in route `loader` (excl. `routes/api/**`) | Thin loader + `warm*Queries` |
| 2+ `useSuspenseQuery` per file | `useSuspenseQueries` (`// ds:allow-use-suspense-query: reason` per line if intentional) |

Escape hatch: `// ds:allow-<rule>: reason` on the line above a flagged line; `ds:check` reports active allow count.

### Warm helpers

Loaders await **identity only**; each route calls its matching helper with `void queryClient.prefetchQuery(...)` (never `await Promise.all` in loaders: `routes/api/**` excluded).

See [`data.md`](../data.md) for the full helper ↔ route table and parity rule.

### Route patterns

| Layout | Loader | Pending UI |
| --- | --- | --- |
| **Split Queue** (Collect, Triage) | Collect: identity + **await** `ensureCollectQueueQueries` (+ `ensureCollectJobDetailWhenSelected` when `?id=`); Triage: identity + `warmTriageQueries` | Collect: `PendingRegion` only on cache miss / hidden filter / job detail. Triage: `RegionBoundary` → `TriageSplitPendingFallback` |
| **Table** (Entities, Identifiers) | Identity + `warmEntitiesQueries` / `warmIdentifiersQueries` | `DataTable` `pending` + `pendingLabel`: per-cell skeleton rows ([§ Tables](tables.md)) |
| **Board** (Tasks) | Identity + `warmTasksQueries` | `PendingRegion` + `BoardSkeleton` |
| **Card grid** (Cases) | Identity only | `PendingRegion` + `CardGridSkeleton` |
| **Graph** | Identity + `ensureGraphQueries` | `GraphCanvasLoadingRegion` (hand skeleton) |
| **Stack** (Dossier, Dashboard, Settings tabs) | Identity + `warmDossierQueries` / `warmDashboardQueries` / … | `ActiveTabBody` or `RegionBoundary` + `stackPendingFallback()` |
| **Case Overview** | Identity + `warmCaseOverviewQueries` | `CaseOverviewPending` (`case-overview-pending.tsx`) |

Button / mutation wait: Button `loading` / `InlineLoading` / `Spinner`: not page skeleton. No data: `EmptyState` / `DetailEmpty`: never Skeleton.

### Loading & empty inventory

Per-surface map for first paint, filtered empty, and fetch failure. Load failures use `FetchErrorAlert` (or route `RouteError` / `RegionBoundary` when the region is Suspense-backed): never `EmptyState`.

| Surface | First load | No results / cleared | Fetch error | Notes |
| --- | --- | --- | --- | --- |
| **Collect** queue | `PendingRegion` + queue skeleton only on `listPending` cache miss (loader awaits evidence/jobs/entities) | `EmptyState` `blank-slate` / `no-results` | `FetchErrorAlert` in queue body | Hidden filter may skeleton once; job-only detail skeleton until `jobDetailQuery` settles (loader awaits when `?id=` is a job). |
| **Triage** queue + detail | `RegionBoundary` → `TriageSplitPendingFallback`; proposals via `useSuspenseQuery` | `EmptyState` `blank-slate` / `cleared` / `no-results` | `RegionBoundary` → `FetchErrorAlert` | Split wrapped in `RegionBoundary`. |
| **Tasks** board | `PendingRegion` + `BoardSkeleton` (`listPending`) | implicit empty columns | route `RouteError` | Workspace uses `useSuspenseQuery` for tasks/entities. |
| **Cases** grid | `PendingRegion` + `CardGridSkeleton` | `EmptyState` `no-results` (search) | route `RouteError` | `casesContextQuery` via `useQuery` + `listPending`. |
| **Entities** / **Identifiers** tables | `DataTable` `pending` + per-cell skeletons | `EmptyState` in table body | route `RouteError` | Tab body Suspense-backed. |
| **Dashboard** panels | `RegionBoundary` / tab skeletons per panel | Recent Activity `EmptyState`; triage/tasks panels dashed inline empty | route `RouteError` | Activity uses `useSuspenseQuery`; refetch de-emphasis only. |

### Rejected loading "delight" patterns

External skeleton/loading skills often recommend shimmer, staggered section entry, content fade-in, and in-page min-display (~500ms). **Do not adopt** on Operate surfaces: they conflict with [Motion](motion.md) and rules 4, 8, 14 above. Router-only pending floor (`defaultPendingMs` / `defaultPendingMinMs`) stays; in-page `listPending()` must drop instantly on cache hit.

Hydration: suppress relative time / session name when needed; no nested `<button>` (`WithTooltip` `wrapSpan`; full-width run headers use `CollapsibleTrigger` `nativeButton={false}` + `render={<div />}` with `stopPropagation` on copyable `IdChip`); `SplitView` static flex pre-hydration.

## Gotchas

- **`useSuspenseQuery` + `enabled`**: Suspense queries do not support `enabled: false`. Split components when `caseId` / `entityId` is optional (`Collect` detail branch, `Dossier` entity branch).
- **Stack loading (Dashboard / Case / Dossier / Settings)**: loader awaits identity only (`casesContext` / case row / entity); warm lists with `void prefetchQuery` (`warmDashboardQueries` / `warmCaseOverviewQueries` / `warmDossierQueries`). Shell uses `useQuery` for tab counts where needed; tab/panel bodies use `ActiveTabBody` → `PendingRegion` + `stackPendingFallback()` or `RegionBoundary` + same fallback. No route-level `RoutePending` on these pages; no "Loading…" copy in data slots.
- **Split Queue loading (Collect / Triage)**: Collect loader awaits `ensureCollectQueueQueries` (+ job detail when `?id=`); catalogs warm in background via `warmCollectCatalogQueries`. Triage: thin loader + `warmTriageQueries`. Domain owns `<Page>` + `PageHeader` + toolbars; queue/detail data slots use `PendingRegion` only on cache miss. Triage wraps the split in `RegionBoundary` → `TriageSplitPendingFallback`.
- **`QueueShell scrollable={false}` while loading**: skeleton row counts (`COLLECT_QUEUE_SKELETON_ROW_COUNT`, `QueueSkeleton rows={10}` in `TriageSplitPendingFallback`) are sized generously and can overflow a short viewport, popping a scrollbar that disappears once real (usually shorter) content lands. Pass `scrollable={!loading}` to `QueueShell` (Collect: `!queuePending`; Triage's only skeleton is `TriageSplitPendingFallback`, always `scrollable={false}`) so the pane clips instead of scrolling during the skeleton state. **`CollectQueueSkeleton`** uses `QueueDayGroup` with **`headerVariant="panel"`** (not sticky): sticky day bars inside a clipped pane overlap mid-list rows.
- **Router `defaultPendingComponent`**: `RoutePendingSkeletonLayout` is a single **`flex-col`** shell (title bar + scrollable `StackBodySkeleton` body). Do not return a fragment of siblings from skeleton layouts meant to fill a flex parent — sections need an inner `gap-6` column (`StackBodySkeletonLayout`).
- **Table/board loading (Entities / Identifiers / Tasks / Graph / Cases)**: thin loader + warm helper; `useQuery` + `listPending` or in-page skeleton in the data slot only; shell stays mounted. **Entities / Identifiers tables:** `DataTable` `pending` + per-cell skeleton rows: never `PendingRegion` (colgroup grid). See [`tables.md`](tables.md) § Tables.
- **Collect run selection**: Cap/Playbook start lives in Collect detail; seed jobs cache from the start response before updating `?id=`; use workspace hooks for SSE + invalidation. Do not Navigate-clobber a just-created selection: that remounts the split and flickers the page.
- **`<Navigate>` for split URL sync: sibling, never an early return.** Collect/Triage keep `?id=`/`?proposalId=` aligned with resolved selection (e.g. auto-picking the first row when the URL has no id) by rendering `<Navigate replace>` (renders `null`; navigates in a layout effect: safe as a sibling). An early `return <Navigate .../>` before the rest of the JSX unmounts the toolbar + split + `PendingRegion` skeleton for a frame while the URL updates, producing a skeleton → blank flash → content flicker right after cold load. Compute the out-of-sync boolean, then render `{outOfSync ? <Navigate .../> : null}` as the first child of the same return that renders the toolbar/split.
