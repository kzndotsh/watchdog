# UI: loading and skeletons

How a page loads without flashing, blanking, or lying. Which route uses which loader and pending component is in [`domains.md`](../domains.md#page-ownership); warm-helper parity is in [`data.md`](../data.md). Only two things here are mechanically enforced: the import bans in [Enforcement](#enforcement) and the router thresholds (test `apps/web/src/__tests__/router.test.ts`). Everything else is `guidance`.

## Doctrine

Thin loader, warm helper, in-page pending region. A loader awaits identity only; lists are warmed with `void queryClient.prefetchQuery(...)` in a `warm*Queries` helper; the data slot shows its own pending state. `useQuery` returns pending on the server and fetches after hydration, so a thin loader trades a fully populated first paint for responsive client navigation. That trade is deliberate. `warmEnsureQueryData` / `warmPrefetchQuery` therefore do nothing on the server: a warm that settled after the HTML was written would be streamed to the client, whose first render would see rows where the server HTML has a skeleton (a hydration mismatch). Only awaited loader queries (`ensureAppQueryData`, Collect's queue) render data on the server.

Router: `defaultPendingMs` 400, `defaultPendingMinMs` 500, `defaultPendingComponent` (minimal shell floor), `defaultErrorComponent: RouteError` (retry via `router.invalidate()`).

Building blocks (all under `apps/web/src/shared/ui/`): `PendingRegion` (`loading` + `label` + `fallback`, built on `LoadingRegion`), hand-built `*Skeleton` fallbacks and `*SkeletonLayout` blocks in `skeletons.tsx`, `stackPendingFallback()` for stack tabs, and `RoutePendingSkeletonLayout` as the router floor. Share row counts and grid templates between live UI and skeleton through exported constants, and use `CHIP_SIZE_CLASS` for chip placeholders. `DataTable` is the exception: it takes `pending` and never a `PendingRegion` ([`tables.md`](tables.md)). Button or mutation wait uses `loading` / `InlineLoading` / `Spinner`, not a page skeleton. No data is `EmptyState` / `DetailEmpty`, never a skeleton.

## Rules

Skeletons are the fallback of last resort; reach for less first.

1. **Static shell never skeletons:** `Page`, `PageHeader`, toolbar, filter chrome, tab strip, split frame, table header and pagination, queue header.
2. **Loaders await identity only:** `casesContextQuery` plus at most one title row; lists via `warm*Queries`.
3. **Shape parity or nothing:** skeletons inside the real container, row count and grid template from a constant both import, median row count not max. Unknown shape: a small centered `InlineLoading`. Tables: `DataTable` `pending` per-cell rows under the real `<colgroup>`.
4. **Keep router thresholds:** no sub-400ms skeletons; they read as a glitch.
5. **Refetch is not pending; loading is not empty:** `listPending()` (`isLoading || !isFetched`) gates the skeleton; an error shows error UI; empty only when settled. `isFetching` is at most a soft `opacity-60` de-emphasis.
6. **No confident wrong values:** a `0` meaning "unknown" is worse than a bone; no fabricated placeholder objects in live chrome.
7. **One loading event, three channels:** `LoadingRegion` puts `aria-busy` on the region, `aria-hidden` on the skeleton subtree, and a sibling sr-only `role="status"` label outside the hidden subtree.
8. **Reduced motion stops animation:** in-place pulse only (`animate-pulse` on `[data-slot=skeleton]`); no travelling shimmer.
9. **Hydration-safe skeletons:** no `window`, `localStorage`, `Date.now()`, or random values in skeleton output. The first client render must equal the server HTML: any query read on first paint is either awaited by the loader or warmed (a no-op on the server).
10. **Fetch only what is visible:** no query in collapsed panels or inside `.map()`; gate artifact content on `open`.
11. **One SSE connection per organization:** `useActivityInvalidation()` in the `_protected` layout binds the single activity `EventSource` to the Query cache; screens do not open their own.
12. **Skeleton is last resort:** if a lesser but true rendering exists, show it and upgrade in place. `code-block.tsx` renders raw code in the same `<pre>` while shiki tokenizes.
13. **Key change is an update, not a new page:** filter, sort, and search use `placeholderData: keepPreviousData` plus a subtle `isPlaceholderData` de-emphasis. Never `initialData` to fake a filtered page.
14. **One pending surface per route:** `pendingComponent` or an in-page `PendingRegion`, never both for the same region. `ssr:false` / `ssr:'data-only'` routes need `pendingComponent` (or the default).
15. **Error granularity equals pending granularity:** a region's query error renders `FetchErrorAlert` + retry inside that region; one failed region must not blank the shell. Route-level failures use `RouteError`; mutations stay on `onError` and toasts.

Not adopted on Operate surfaces: shimmer, staggered section entry, content fade-in, in-page minimum display time. They conflict with the motion budgets in [`DESIGN.md`](../../../../DESIGN.md#motion) and rules 4, 8, and 12.

## Enforcement

oxlint `no-restricted-imports` bans `RoutePending` (`@/shared/layout/route-pending`) and the raw `Skeleton` primitive in `domains/` and `routes/`. Nothing enforces the rest: not `await Promise.all` in route loaders (outside `routes/api/**`), not `animate-pulse` or `aria-busy` outside `shared/ui`. The `// ds:allow-<rule> - reason` escape (a dash or em dash plus a reason) applies to `ds:ban` rules only.

## Gotchas

- **`<Navigate>` for split URL sync is a sibling, never an early return.** Collect and Triage keep `?id=` / `?proposalId=` aligned with the resolved selection by rendering `<Navigate replace>` (renders `null`, navigates in a layout effect). An early `return <Navigate .../>` unmounts the toolbar, split, and skeleton for a frame, giving a skeleton, blank, content flicker after cold load. Compute the out-of-sync boolean and render `{outOfSync ? <Navigate .../> : null}` as a child of the same return as the toolbar and split.
- **`QueueShell scrollable={false}` while loading.** Skeleton row counts are generous and can overflow a short viewport, popping a scrollbar that vanishes when real content lands. Pass `scrollable={!loading}` so the pane clips during the skeleton state. `CollectQueueSkeleton` uses `QueueDayGroup` with `headerVariant="panel"` (not sticky) because sticky day bars inside a clipped pane overlap rows.
- **Router `defaultPendingComponent`:** `RoutePendingSkeletonLayout` is a single `flex-col` shell (title bar + scrollable `StackBodySkeleton`). Skeleton layouts meant to fill a flex parent must not return a fragment of siblings; sections need an inner `gap-6` column (`StackBodySkeletonLayout`).
- **Stack pages** (Case, Dossier, Settings tabs): tab bodies use `ActiveTabBody` + `stackPendingFallback()`. The Dashboard is not a stack-tab page: its overview and activity slots use hand `*Skeleton` fallbacks inline. No "Loading..." copy in data slots.
- **Collect run selection:** seed the jobs cache from the start response before updating `?id=`, and use the workspace hooks for SSE and invalidation. A `<Navigate>` that clobbers a just-created selection remounts the split and flickers.
- **Hydration:** suppress relative time and session name where needed, and keep `SplitView` as static flex before hydration.
