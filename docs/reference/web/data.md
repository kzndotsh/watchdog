# Data: Query, Case scope, live events

How data reaches the UI and when it refreshes. oRPC internals are in [`architecture.md`](architecture.md) and [`../platform/README.md`](../platform/README.md). Nothing here is mechanically enforced except where a test or type is named; the rest is `guidance`.

## Case scope

Active Case id is the httpOnly cookie `watchdog.active-case-id`, not part of the URL: tabs share one Active Case and deep links do not encode it. Almost every list and detail query takes `caseId` (keys include it); never assume "global" graph data. The Active-Case hook `useSelectActiveCase` (`domains/cases/hooks/use-select-active-case.ts`) owns a Case switch and its invalidation (`invalidateAfterCaseSwitch`, `shared/lib/query-invalidation.ts`): do not call those by hand after a switch. The Case route heals the cookie to `/cases/$slug` through the server function `healActiveCaseFn`, a compare-and-set: it writes only while the cookie still holds the Active Case the loader observed (`expectedActiveCaseId`), and the loader drops a heal that a newer switch (epoch bump) outran.

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
| `shared/lib/query-stale.ts` | `STALE_*` / `GC_*` tiers: `STALE_REALTIME` 10s (jobs, proposals), `STALE_DEFAULT` 30s (entities, evidence, case context), `STALE_STABLE` 5m (capabilities, credentials). `gcTime >= staleTime` holds by construction. |
| `shared/lib/query-invalidation.ts` | Named invalidation contracts |
| `shared/lib/query-client.ts` | `createAppQueryClient` + global `QueryCache.onError` toast |
| `shared/lib/queue-selection.ts` | `resolveQueueSelection` (URL SoT, then first visible row) for split-view queues; `holdMissingUrlId` keeps a just-started or filtered-out id. Pair with a render-time `<Navigate replace>` ([`loading.md`](ui/loading.md#gotchas)), not a parent-callback sync effect |

### Invalidation contracts

Mutations and SSE call the named contracts in `shared/lib/query-invalidation.ts` (`invalidateAfterCaseSwitch`, `invalidateAfterJobMutation`, `invalidateAfterProposalAccept`, `invalidateAfterProposalQueueChange`, `invalidateAfterEntityChanged`, `invalidateAfterTaskMutation`, `invalidateAfterEvidenceMutation`, `invalidateAfterCredentialMutation`), not scattered `invalidateQueries` key lists. Inside them, soft settle is `invalidateQueries({ refetchType: "none" })` then `refetchQueries({ type: "active" })`, so nothing flashes a loading state. `invalidateAfterEntityChanged` soft-invalidates the `entities` plus `edges` / `identifiers` prefixes so case-wide lists refresh denormalized labels.

### Mutations and cache writes

`useMutation` and QueryClient cache writes (`invalidateQueries`, `setQueryData`, `setQueriesData`, `removeQueries`, `resetQueries`, `refetchQueries`, `cancelQueries`) live in `domains/*/hooks/` and `shared/hooks/`; cache writes may also live in `shared/lib/query-invalidation.ts`. A component calls the hook (`useDeleteCase`, `useDeleteEntity`) and keeps only dialog and form state. Query keys are defined in a queries module, which means a `queries.ts`, a `*-queries.ts` or a `*-keys.ts` file, and imported everywhere else; calling a factory (`queryKey: casesKeys.all`) is always fine. Lint enforces all three (`watchdog/mutation-only-in-hooks`, `watchdog/cache-writes-only-in-hooks`, `watchdog/query-keys-in-queries-modules`); sites that predate the rules are baselined per file and the baselines only shrink.

### Loaders, warm helpers, pending

Loaders `ensureQueryData` identity only and call a `warm*Queries` helper with `void prefetchQuery` (the per-layout table is in [`domains.md`](domains.md#page-ownership); helpers live in each domain's `lib/prefetch-*.ts`). Collect is the exception: its loader awaits `ensureCollectQueueQueries` (plus the job detail when `?id=` is a job). Warm helpers run in the browser only (server no-op), so SSR HTML and the first client render agree ([`ui/loading.md`](ui/loading.md#doctrine)).

**Warm-helper parity:** every `warm*Queries` helper should prefetch the queries the page reads on first paint; otherwise that region shows its skeleton on a cache miss. When touching a page, compare its query keys with its helper. The dossier shell hook (`use-dossier-shell-queries`) is the implicit warm layer for tab counts.

**List pending gate:** table, board, and graph surfaces use `listPending()` (`shared/lib/list-pending.ts`): `isLoading || !isFetched`, not `isPending` alone, and never a skeleton on `isError`. Gate optional reads with `enabled` (`caseId` / `entityId` may be absent).

## Live events

One `EventSource` on `/api/events` carries the whole organization (ADR-0005): every Case the caller can see, on one connection, however many Cases the dashboard shows and however many components mount. `useActivityInvalidation()` (`shared/hooks/use-activity-stream.ts`) is mounted once, in the `_protected` layout; it binds the stream (`shared/lib/activity-stream.ts`) to the Query cache through `bindActivityInvalidation` (`shared/lib/activity-invalidation.ts`). Screens do not subscribe for invalidation. A screen with a side effect beyond refetching uses `useActivityEntries(onEntry)` on the same connection (Triage resets its queue filter on a Proposal entry); filter by `entry.caseId` or `entry.kind` in the callback.

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
- Blobs are S3 objects via presigned PUT. Browsers PUT with `Content-Type` and the signed `x-amz-meta-sha256` header, so a deployed bucket's CORS `AllowedHeaders` must allow both (or `*`).

## Tables

Client-side sort, filter, and paging through `shared/ui/data-table` is correct for Day-0 case-scoped lists; hoist `globalFilterFn` to a stable reference. Column sizing and pending: [`tables.md`](ui/tables.md). Virtualization or server paging comes when volume demands it.

## Gotchas

- **Router loaders do not inherit parent loader data**; sibling pages share data via Query keys ([`architecture.md#gotchas`](architecture.md#gotchas)).
- **SSE:** one organization-wide `EventSource`, bound to the Query cache once in `_protected`. Do not add a per-screen subscription for invalidation (it would run the same refetch twice); use `useActivityEntries` only for a side effect.
