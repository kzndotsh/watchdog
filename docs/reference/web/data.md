# Data: Query, Case scope, live events

How data reaches the UI and when it refreshes. oRPC internals are in [`architecture.md`](architecture.md) and [`../platform/README.md`](../platform/README.md). Nothing here is mechanically enforced except where a test, type or lint rule is named; the rest is `guidance`.

## Case scope

A Work URL names its Case (`/cases/$caseSlug/...`), so a link opens the right Case for any member with access and two tabs can hold two Cases. The `_protected` layout puts the URL's Case in a React context (`useRouteCase`, `shared/hooks/use-route-case.ts`; `useWorkCase` for a part that only renders under a Case route), and `useCasesContext().active` is that Case when there is one, else the Case the httpOnly cookie `watchdog.active-case-id` holds (the last Case entered: the default for Case-less screens). A screen, its links and its navigation read the Case from there, never from the cookie. Access is unchanged and server-side: the slug resolves through `getCaseBySlugFn` to the org-scoped oRPC procedure `cases.getBySlug` (core `getCaseBySlugEffect`: one lookup by slug inside the caller's organization, `NotFoundError` for an unknown or foreign slug, so the answer never reveals that another organization's Case exists). A Work screen reads its Case with `useLiveWorkCase` (the URL's Case, live from the list), which throws outside a Case route rather than falling back to the cookie. Almost every list and detail query takes `caseId` (keys include it); never assume "global" graph data. The Active-Case hook `useSelectActiveCase` (`domains/cases/hooks/use-select-active-case.ts`) owns a Case switch and its invalidation (`invalidateAfterCaseSwitch`, `shared/lib/query-invalidation.ts`): do not call those by hand after a switch. `useCasesChangedInvalidation()` (`shared/hooks/use-cases-changed-invalidation.ts`) binds the Case-change notification (`watchdog:cases-changed`, emitted by Case create, update and delete flows) to the same case-switch invalidation and is mounted once, in the `_protected` layout; a screen does not bind it again. Which Case is Active for a stored id (kept while visible to the organization, else the first visible Case, else none) is one core rule, `resolveActiveCaseEffect`, run by `getCasesContextFn` and `deleteCaseFn` through `cases-active.server.ts`. Entering a Case route heals the cookie to that Case (`healActiveCaseToRoute`, in the layout's `beforeLoad`) through the server function `healActiveCaseFn`, a compare-and-set: it writes only while the cookie still holds the Active Case the loader observed (`expectedActiveCaseId`), and the `beforeLoad` drops a heal that a newer switch (epoch bump) outran. A switch made on a Case URL (`useSelectActiveCase`) moves to the same screen of the new Case (`navigateAfterActiveCaseSwitch`); otherwise the heal would snap the cookie back. A Work URL without its Case (`/collect`, ...) and a `/cases/<id>` URL are not found: only a slug names a Case. SSE invalidation is keyed by the entry's `caseId`, not by the cookie.

**Deleted Cases (#304).** A Case delete is a tombstone: the server hides the Case from every read at once, and the web takes it out of every Case cache in the same step (`dropCaseFromCaches`, `domains/cases/hooks/case-cache.ts`: its detail rows are removed, because the route guard reads them with a static stale time and a cached row would reopen a Case the server now hides; the shared list loses it and the Active Case heals to the first remaining one), then settles through `invalidateAfterCaseSwitch`. A restore forgets the "not found" a guard cached for the URL (`forgetMissingCase`) before it invalidates. The Deleted Cases queries (`deletedCasesQuery`, `deletedCaseBySlugQuery`) and the caller's Case policy (`deletionPolicyQuery(caseId?)`: the restore window, whether the caller is an owner or admin and, with a Case id, how many Jobs a delete would cancel) sit under the `["cases"]` prefix, so every Case change refreshes them. The role is read from that policy, from the server's own check, never guessed from the session. Other open sessions learn of a delete or restore from the Case-level activity entry (`deleted` / `restored`, mapped to the Case-slice invalidation), and the SSE stream drops the Case at once.

## TanStack Query (cache SoT)

Query owns server-state caching. The router's `defaultPreloadStaleTime` is `0` (asserted in `apps/web/src/__tests__/router.test.ts`), so Query controls freshness.

| Path | Use when |
| --- | --- |
| Route `loader` + `queryClient.ensureQueryData(queryOptions)` | Prefetch during navigation and SSR |
| `useQuery(queryOptions)` | Page and region reads: branch on `listPending` (skeleton) and `error` (`FetchErrorAlert` + retry) |
| `useMutation` + a named invalidation contract | Writes |
| The organization activity stream calling the same contracts | Server-pushed job, proposal, graph, evidence, task and Case updates |

- Never copy server lists from `useLoaderData` into `useState`; local state is for selection, dialogs, form drafts, and client filters.
- One `QueryClient` per request, created by `createAppQueryClient()` inside `getRouter()`. Never `export const queryClient = new QueryClient()`.

| File | Owns |
| --- | --- |
| `domains/{noun}/queries.ts` | `queryOptions` + key factories (no components, no side effects) |
| `shared/lib/query-stale.ts` | `STALE_*` / `GC_*` tiers: `STALE_REALTIME` 10s (jobs, proposals), `STALE_DEFAULT` 30s (entities, evidence, case context), `STALE_STABLE` 5m (capabilities, credentials), `STALE_SESSION` 60s (the session; the `_protected` guard, equal to the Better Auth cookie cache). The organization state (`organizationStateQuery`) is cached until `invalidateAfterOrganizationChange`. `gcTime >= staleTime` holds by construction. |
| `shared/lib/query-invalidation.ts` | Named invalidation contracts |
| `shared/lib/query-client.ts` | `createAppQueryClient` + global `QueryCache.onError` toast |
| `shared/lib/queue-selection.ts` | `resolveQueueSelection` (URL SoT, then first visible row) for split-view queues; `shouldHoldMissingUrlId` keeps a just-started or filtered-out id. Pair with a render-time `<Navigate replace>` ([`loading.md`](ui/loading.md#gotchas)), not a parent-callback sync effect |

### Invalidation contracts

Mutations and SSE call the named contracts in `shared/lib/query-invalidation.ts` (`invalidateAfterCaseSwitch`, `invalidateAfterJobMutation`, `invalidateAfterProposalAccept`, `invalidateAfterProposalQueueChange`, `invalidateAfterEntityChanged`, `invalidateAfterTaskMutation`, `invalidateAfterEvidenceMutation`, `invalidateAfterCredentialMutation`, `invalidateAfterOrganizationChange`), not scattered `invalidateQueries` key lists. Inside them, soft settle covers every affected key at once: all keys are marked `invalidateQueries({ refetchType: "none" })` first, then the active observers of all of them are refetched in parallel (`refetchQueries({ type: "active" })` per key under one `Promise.all`), so nothing flashes a loading state and every slice is fresh after one round (Accept used to take up to eight serial rounds). The returned promise resolves when every refetch has finished; if one fails, the others still run to completion and the promise then rejects with the first failure. A key another key in the same call already covers is not refetched twice. `invalidateAfterEntityChanged` soft-invalidates the `entities` plus `edges` / `identifiers` prefixes so case-wide lists refresh denormalized labels.

A Playbook run's per-step view (`jobsKeys.playbookRun`, `playbookRunQuery`) sits under `jobsKeys.all(caseId)`, so `invalidateAfterJobMutation` (every Job mutation and every SSE `job` entry) refetches it while a Job detail is open. A retry that resumes a finished run therefore reopens the spine (run `running`, outcome cleared, the skipped dependents `pending`) with no extra invalidation call. A Job's provider calls (`jobsKeys.providerCalls`) sit under the same prefix, and an Evidence item's (`evidenceKeys.providerCalls`) under `evidenceKeys.all(caseId)`, so each refreshes with the Job or Evidence change that adds a call.

### Mutations and cache writes

`useMutation` and QueryClient cache writes (`invalidateQueries`, `setQueryData`, `setQueriesData`, `removeQueries`, `resetQueries`, `refetchQueries`, `cancelQueries`) live in `domains/*/hooks/` and `shared/hooks/`; cache writes may also live in `shared/lib/query-invalidation.ts`. A component calls the hook (`useDeleteCase`, `useDeleteEntity`) and keeps its own UI state; the mutation logic moves to the hook. A hook passes the Case and target of a write through the mutation variables, not hook props, so a pending write settles the Case it started in after an Active Case switch. Query keys are defined in a queries module, which means a `queries.ts`, a `*-queries.ts` or a `*-keys.ts` file, and imported everywhere else; calling a factory (`queryKey: casesKeys.all`) is always fine. Lint enforces all three (`watchdog/mutation-only-in-hooks`, `watchdog/cache-writes-only-in-hooks`, `watchdog/query-keys-in-queries-modules`); sites that predate the rules are baselined per file and the baselines only shrink.

### Loaders, warm helpers, pending

Loaders `ensureQueryData` identity only and call a `warm*Queries` helper with `void prefetchQuery` (the per-layout table is in [`domains.md`](domains.md#page-ownership); helpers live in each domain's `lib/prefetch-*.ts`). Collect is no exception: its loader calls `warmCollectQueries` (the queue lists, catalogs and, when `?id=` is set, the selected row), like Triage. Warm helpers run in the browser only (server no-op), so SSR HTML and the first client render agree ([`ui/loading.md`](ui/loading.md#doctrine)).

**Warm-helper parity:** every `warm*Queries` helper should prefetch the queries the page reads on first paint; otherwise that region shows its skeleton on a cache miss. When touching a page, compare its query keys with its helper. The dossier shell hook (`use-dossier-shell-queries`) is the implicit warm layer for tab counts.

**List pending gate:** table, board, and graph surfaces use `listPending()` (`shared/lib/list-pending.ts`): `isLoading || !isFetched`, not `isPending` alone, and never a skeleton on `isError`. Gate optional reads with `enabled` (`caseId` / `entityId` may be absent).

### Paged lists

The API pages every list ([`types.md`](../platform/types.md#pagination)). A list that can grow without bound reads a page at a time through an infinite query (`infiniteQueryOptions`, `getNextPageParam: last.nextCursor ?? undefined`, a `select` that flattens the loaded pages so `data` stays an array) and the screen puts `LoadMore` (`shared/ui/load-more.tsx`, "Show more") under the rows. Such a list is a window over the server's order: a count shows `N+` while `hasNextPage`. A list with filters, search or a URL selection is a declared list instead ([`lists.md`](lists.md)): those belong on the server. The skeleton rule is unchanged: `listPending` works on an infinite result. Warm helpers use `warmEnsureInfiniteQueryData` (`shared/lib/warm-query.ts`), which calls `queryClient.infiniteQuery`. Paged today: Recent activity (`recentActivityQuery`) and row history (Deleted Cases and the Triage queue are declared lists: [`lists.md`](lists.md)). The other lists feed lookups, graphs and merged queues that need the whole list (Entities, Jobs, Connections, Tasks, the other dossier tabs, the Dashboard's due-Tasks section, and Collect's queue over the Case's Evidence; the Evidence and Entity pickers search on the server instead, see [`lists.md`](lists.md#gotchas)), so their ServerFns read every page (`listAllPages`, `lib/list-pages.server.ts`) and return an array; moving one to a window means giving each of its other readers an answer for the rows not loaded. A tile count is never `array.length` over one of them: the Case overview and the Dashboard read `cases.counts` (`caseCountsQuery`, `domains/cases/queries.ts`), the Case's entities, identifiers, connections, visible Evidence, live Jobs (a playbook run once) and open Tasks overdue or due in the next 7 days in one request, each exact below `LIST_TOTAL_CAP` and capped above it (`tileCount` prints `1000+`); `dayStart` is the browser's local midnight, so "overdue" follows the investigator's clock. Its key sits under `casesKeys.counts()`, which every Case data mutation and live update refreshes. A pending-Proposals tile and a tab count read a list's first-page `total` instead. What the Case overview still reads beyond counts is one small page each: the newest Evidence (the picker projection, 12 rows), the newest 50 Jobs and the pending Proposals (12), with the Entities and Evidence that Job inputs name read by id.

### Declared lists

A list declared with `defineList` (ADR-0007, spec #547) has one web shape, with no per-screen state: `listView(def, { domain, scopeKey, fetchPage, getId, ... })` (`shared/lib/list/list-view.ts`, built in the domain's `queries.ts`) keys every view `[domain, ...scope, "list", def.name, def.keyOf(query)]`, under the key root the invalidation contracts already name, and stops `getNextPageParam` at `LIST_MAX_PAGES`. `useList(view, { scope, fixed?, search, onSearchChange })` (`shared/hooks/list/use-list.ts`) reads the route's search through `def.queryOf`, reports every change as a `def.toSearch` patch through the screen's `onSearchChange` (a route connects it to `usePatchSearch`, a history replace, so the view lives in the URL), and returns the handle the list parts take: rows, `status` (`pending`, `error`, `blank`, `no-match`, `ready`; never `blank` while filtered), the count, Load more, the controls and a selection that clears with the view. The search box's text is a draft that is the source of truth while it has focus; it is written once settled (`LIST_SEARCH_DEBOUNCE_MS`) and only when empty or at least `LIST_SEARCH_MIN_LENGTH` characters. A new view shows the previous view's rows de-emphasised, never a skeleton. A `cursor_stale` 400 resets the view to page one once. `softInvalidate` refetches a view (`meta.isListView`) through `throttledListRefetch` (`shared/lib/list/list-refetch-throttle.ts`): at once, then at most one trailing walk per `LIST_REFETCH_THROTTLE_MS` (2 s), so an ingest burst re-walks each open view's pages once, not once per entry. The parts are in `shared/ui/list/` ([`atoms.md`](ui/atoms.md#lists)); the `/ui` gallery's Lists section runs them on in-memory data. On it: the Identifiers table (`identifierListView`), the Dossier Identifiers tab (the same view with `entityId` fixed) and the Dossier Evidence tab (`evidenceListView`, a queue body whose `?id=` selection resolves through `evidenceByIdQuery` when it is not loaded); their tab counts are `useListCount` over each list's default view. To add a screen, follow [`lists.md`](lists.md).

## Live events

One `EventSource` on `/api/events` carries the whole organization (ADR-0005): every Case the caller can see, on one connection, however many Cases the dashboard shows and however many components mount. `useActivityInvalidation()` (`shared/hooks/use-activity-stream.ts`) is mounted once, in the `_protected` layout; it binds the stream (`shared/lib/activity-stream.ts`) to the Query cache through `bindActivityInvalidation` (`shared/lib/activity-invalidation.ts`). Screens do not subscribe for invalidation; none reacts to an entry beyond refetching.

The stream listens for one SSE event, `activity`, whose payload is `activityEntrySchema` (`packages/schemas/src/activity-log.ts`), and for `resync`. Each message carries `id:` = the entry cursor, so the browser resends it as `Last-Event-ID` after a transient drop and the server replays the gap. If the browser gives up (the source is `CLOSED`) the module reopens it after a backoff (1 s doubling to 30 s) with `?after=<last cursor>`. Delivery is at-least-once: the client drops entries at or below its last cursor.

`invalidateForActivity(client, entry)` maps the entry to the same contracts the mutations use; a burst of entries of one target for one Case (a patch of N ops appends N) runs one pass:

| Entry kind | Contract |
| --- | --- |
| `job` | `invalidateAfterJobMutation` |
| `proposal` (`created`, `accepted`, `rejected`) | `invalidateAfterProposalQueueChange` |
| `entity`, `edge`, `claim`, `identifier`, `event`, `question` | `invalidateAfterGraphActivity` (`invalidateAfterEntityChanged` plus the claim, event and question prefixes of the Case) |
| `evidence` | `invalidateAfterEvidenceMutation` |
| `task` | `invalidateAfterTaskMutation` |
| `case` | `invalidateAfterCaseSwitch` (Case list, feed, search) |
| `resync` | `invalidateAfterResync`: every query stale, the active ones refetched |

Recent activity (`recentActivityQuery`) has no SSE type of its own: every contract above soft-invalidates `activityKeys.all`, and the feed itself reads only the log (ADR-0005 decision 5; which `(kind, action)` pairs it shows is `FEED_ACTIONS` in `@watchdog/core/activity`). Don't invent a workspace-wide channel for it.

- No manual Refresh buttons on live paths. Keep previous rows on refetch; don't remount the split skeleton.
- Optimistic writes settle through the same contract: board drag may `setQueriesData` under `tasksKeys.all(caseId)`, and a Cap start may seed `jobsKeys.all` and `jobsKeys.detail` from the mutation result before `onJobIdChange`, so URL selection does not flicker. Don't invent a second local list SoT.

## Mutations to UI

1. `useMutation` calls a ServerFn (toast on failure; query errors toast globally via `QueryCache.onError`).
2. On success, call the named contract; never an imperative `refresh()`.
3. When the worker finishes later, SSE calls the same contracts.

## Evidence and artifacts

- Evidence rows come from the `intake` domain (`evidenceListQuery` and the upload Fns): one row per dump; Enrich/Process internals stay on the Job. The Dossier Evidence tab dumps with `entityId` set through the same Fns (`useDumpEvidence`).
- Artifact display text is `artifactContentQuery`; the Evidence Content tab uses `hooks/use-evidence-blob.ts`.
- Blobs are S3 objects via presigned PUT. Browsers PUT with `Content-Type` and the signed `x-amz-meta-sha256` header, so a deployed bucket's CORS `AllowedHeaders` must allow both (or `*`). The presigned URL also signs the declared `Content-Length`: the browser sets that header itself, and the store refuses a body of another size. `confirmFile` then verifies the stored bytes server-side and records the server's hash ([`custody`](../../reference/contracts/custody.md#evidence-uploads)).

## Tables

Client-side sort, filter, and paging through `shared/ui/data-table` is correct for Day-0 case-scoped lists; hoist `globalFilterFn` to a stable reference. Column sizing and pending: [`tables.md`](ui/tables.md). Virtualization or server paging comes when volume demands it.

## Gotchas

- **Router loaders do not inherit parent loader data**; sibling pages share data via Query keys ([`architecture.md#gotchas`](architecture.md#gotchas)).
- **SSE:** one organization-wide `EventSource`, bound to the Query cache once in `_protected`. Do not add a per-screen subscription for invalidation (it would run the same refetch twice).
