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
| SSE `useLiveEvents` calling the same contracts | Server-pushed job, proposal, entity, evidence, task updates |

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

### Loaders, warm helpers, pending

Loaders `ensureQueryData` identity only and call a `warm*Queries` helper with `void prefetchQuery` (the per-layout table is in [`domains.md`](domains.md#page-ownership); helpers live in each domain's `lib/prefetch-*.ts`). Collect is the exception: its loader awaits `ensureCollectQueueQueries` (plus the job detail when `?id=` is a job). Warm helpers run in the browser only (server no-op), so SSR HTML and the first client render agree ([`ui/loading.md`](ui/loading.md#doctrine)).

**Warm-helper parity:** every `warm*Queries` helper should prefetch the queries the page reads on first paint; otherwise that region shows its skeleton on a cache miss. When touching a page, compare its query keys with its helper. The dossier shell hook (`use-dossier-shell-queries`) is the implicit warm layer for tab counts.

**List pending gate:** table, board, and graph surfaces use `listPending()` (`shared/lib/list-pending.ts`): `isLoading || !isFetched`, not `isPending` alone, and never a skeleton on `isError`. Gate optional reads with `enabled` (`caseId` / `entityId` may be absent).

## Live events

`useLiveEvents(caseId, onEvent)` in `shared/hooks/use-live-events` opens an `EventSource` on `/api/events?caseId=...`. One shared `EventSource` per `caseId` is ref-counted, so mounting it in several places does not open several connections; the server side of that route listens through a dedicated postgres.js connection ([`packages/db/AGENTS.md`](../../../packages/db/AGENTS.md)). Event shapes are typed in `packages/schemas/src/watchdog-events.ts`.

| Type | Contract |
| --- | --- |
| `job_update` | `invalidateAfterJobMutation` (+ evidence where jobs touch intake) |
| `proposal_created`, `proposal_queue_changed` | `invalidateAfterProposalQueueChange` (test with `isProposalQueueLiveEvent` from `@watchdog/schemas`) |
| `entity_changed` | `invalidateAfterEntityChanged` |
| `evidence_changed` | `invalidateAfterEvidenceMutation` |
| `task_changed` | `invalidateAfterTaskMutation` |

The cross-case Dashboard Activity feed (`recentActivityQuery`) has no SSE type of its own; the task, job, proposal, and evidence contracts soft-invalidate `activityKeys.all`. Don't invent a workspace-wide channel for it.

- A `null` `caseId` means no connection. A nested workspace passes `live: false` (e.g. `useTaskWorkspace(caseId, { live: false })` in `dossier-tasks-section.tsx`) when its parent already listens.
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
- **SSE:** `useLiveEvents` ref-counts one `EventSource` per `caseId`; still prefer a single listener per surface tree and pass `live: false` into nested workspaces so one event doesn't run two handlers.
