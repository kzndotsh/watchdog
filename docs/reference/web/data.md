# Data — Query, Case scope, live events

**What this is:** how data reaches the UI and when it refreshes.  
**Not:** oRPC router internals (see [`ARCHITECTURE.md`](architecture.md) · [`docs/reference/platform/README.md`](../../../docs/reference/platform/README.md)) or DB schema (packages).

## Case scope

- Active Case id = httpOnly cookie `watchdog.active-case-id` (not in the URL).
- Tabs share one Active Case; deep links do not encode Case.
- After Case switch: `notifyCasesChanged()` + `invalidateAfterCaseSwitch(queryClient)` (see `shared/lib/query-invalidation.ts`).

Almost all list/detail queries take `caseId` (keys include it). Never assume “global” graph data.

## TanStack Query (cache SoT)

Query owns server-state caching. Router `defaultPreloadStaleTime` is `0` so Query freshness wins.

| Path | Use when |
| --- | --- |
| Route `loader` + `queryClient.ensureQueryData(queryOptions)` | Prefetch during navigation / SSR |
| `useSuspenseQuery(queryOptions)` | Loader-guaranteed data in the page |
| `useQuery(queryOptions)` | Optional / deferred (e.g. artifact body) |
| `useMutation` + **named invalidation contract** | Writes |
| SSE `useLiveEvents` → same contracts | Server-pushed job/proposal/entity/task updates |

**Do not** fork server lists into `useState` after `useLoaderData`. Local state is for UI only (selection, dialogs, form drafts, client filters).

**Do not** export a module-level `QueryClient` singleton. Create per request in `getRouter()` via `createAppQueryClient()`.

### File layout

| File | Owns |
| --- | --- |
| `domains/{noun}/queries.ts` | `queryOptions` + key factories (import Fns; no components, no side effects) |
| `shared/lib/query-stale.ts` | `STALE_*` / `GC_*` tiers |
| `shared/lib/query-invalidation.ts` | Named contracts (`invalidateAfterJobMutation`, …) |
| `shared/lib/query-client.ts` | `createAppQueryClient` + global `QueryCache.onError` toast |
| `shared/lib/queue-selection.ts` | Cross-domain pure `resolveQueueSelection` (URL SoT → first visible row) for split-view queues; optional `holdMissingUrlId` keeps a URL id not yet in rows (Collect cap start race / filtered-out job). Pair with render-time `<Navigate replace>` in Collect / Triage (not a parent-callback sync effect) |
| `router.tsx` | QueryClient in context + `setupRouterSsrQueryIntegration` |

### Stale tiers

| Tier                   | Use for                          |
| ---------------------- | -------------------------------- |
| `STALE_REALTIME` (10s) | Jobs, proposals (SSE-backed)     |
| `STALE_DEFAULT` (30s)  | Entities, evidence, case context |
| `STALE_STABLE` (5m)    | Capabilities, credentials        |

Rule: `gcTime ≥ staleTime` for the tier you pick.

### Invalidation contracts

Call these from mutations and SSE — do not scatter ad-hoc `invalidateQueries` key lists:

- `invalidateAfterCaseSwitch`
- `invalidateAfterJobMutation` (optional staggered retry when worker lag matters)
- `invalidateAfterProposalAccept`
- `invalidateAfterProposalQueueChange` (Reject / `proposal_created`)
- `invalidateAfterEntityChanged` (soft-invalidates `entities` + `edges`/`identifiers` **prefixes** so case-wide `forCase` lists refresh denormalized labels; entity-scoped claims/events/questions when `entityId` set)
- `invalidateAfterTaskMutation`
- `invalidateEvidence` / `invalidateCredentials`

Soft settle (no loading flash): `invalidateQueries({ refetchType: "none" })` then `refetchQueries({ type: "active" })` — used inside the contracts.

### Key shape (hierarchical)

```ts
["cases"] /
  ["cases", "context"] /
  ["cases", "detail", caseId][("jobs", caseId)][
    ("jobs", caseId, "detail", jobId)
  ][("proposals", caseId)][("evidence", caseId)][("entities", caseId)][
    ("entity", caseId, slug)
  ][
    ("claims" | "edges" | "events" | "identifiers" | "questions",
    caseId,
    entityId)
  ][("edges" | "identifiers", caseId, "case")][("tasks", caseId)][
    ("tasks", caseId, filters)
  ]["capabilities"] /
  ["credentials"][("artifact", uri, mime)];
```

**Router gotcha:** child `loader({ context })` gets `beforeLoad` context (e.g. `{ session, user }` + `queryClient`), **not** parent loader return data. Sibling pages share data via **Query keys**, not parent loader inheritance. See [`README.md#traps-index`](README.md#traps-index).

### Suspense split

`useSuspenseQuery` cannot use `enabled: false`. When data needs `caseId` / `entityId`, split components (`Collect` → active detail, `Dossier` → `DossierForCase` → `DossierForEntity`).

Stack pages: loader `ensureQueryData` identity only + warm helpers (`warmDossierQueries` / `warmCaseOverviewQueries` / `warmDashboardQueries`). Shell counts = `useQuery`; tab/panel bodies = `ActiveTabBody` / `RegionBoundary` + `stackPendingFallback()`. Queue pages: Collect loader **awaits** `ensureCollectQueueQueries` (+ job detail when `?id=`); Triage stays identity + `warmTriageQueries`. In-page `PendingRegion` remains for cache misses — not route-level `RoutePending`. Table pages (`/entities`, `/identifiers`): `listPending` → `DataTable` `pending` ([`tables.md`](ui/tables.md)).

**Warm-helper parity:** every `warm*Queries` helper must prefetch every query the page's components suspend on. Adding a `useSuspenseQuery` (or a second call in the same file) requires updating the matching warm helper in the same change — or switching to `useSuspenseQueries`. The dossier shell hook (`use-dossier-shell-queries`) is the implicit warm layer for tab counts; compare query keys when touching dossier sections.

| Helper | Route / surface | Prefetch module |
| --- | --- | --- |
| `ensureCollectQueueQueries` | `/collect` (loader await) | `collect/lib/prefetch-collect.ts` |
| `warmCollectCatalogQueries` | `/collect` (fire-and-forget after queue ensure) | `collect/lib/prefetch-collect.ts` |
| `warmTriageQueries` | `/triage` | `triage/lib/prefetch-triage.ts` |
| `warmEntitiesQueries` | `/entities` | `entities/lib/prefetch-entities.ts` |
| `warmIdentifiersQueries` | `/identifiers` | `entities/lib/prefetch-identifiers.ts` |
| `ensureGraphQueries` | `/graph` | `cases/lib/prefetch-graph.ts` |
| `warmTasksQueries` | `/tasks` | `tasks/lib/prefetch-tasks.ts` |
| `warmCaseOverviewQueries` | Case overview tab | `cases/lib/prefetch-case-overview.ts` |
| `warmDossierQueries` | Dossier | `dossier/lib/prefetch-dossier.ts` |
| `warmDashboardQueries` | `/` Dashboard | `dashboard/lib/prefetch-dashboard.ts` |

**List pending gate:** table/board/graph list surfaces use `listPending()` from `shared/lib/list-pending.ts` — `isLoading || !isFetched`, not `isPending` alone; never show skeleton on `isError`.

## Live events

Hook: `shared/hooks/use-live-events` → `useLiveEvents(caseId, onEvent)` → `EventSource` `/api/events?caseId=…`.

| Type | Contract |
| --- | --- |
| `job_update` | `invalidateAfterJobMutation` |
| `proposal_created` | `invalidateAfterProposalQueueChange` (workspace flips to pending-only, same as first paint) |
| `entity_changed` | `invalidateAfterEntityChanged` |
| `task_changed` | `invalidateAfterTaskMutation` |

Cross-case **Activity** on Dashboard (`recentActivityQuery` / `GET /activity/recent`) has no dedicated SSE type. Soft-invalidate `activityKeys.all` from task / job / proposal / evidence named contracts (same as live Dashboard handlers). Do not invent a workspace-wide SSE channel just for this feed.

Rules:

- Pass `null` caseId to `useLiveEvents` → no SSE connection.
- `useTaskWorkspace(caseId, { live: false })` skips SSE (passes `null` to `useLiveEvents`) when a parent already listens — e.g. `dossier-tasks-section.tsx`.
- No manual Refresh buttons for these paths — live + post-mutation invalidate.
- Keep previous rows on refetch; don’t remount the whole split skeleton.
- Board status drag may optimistically `setQueriesData` under `tasksKeys.all(caseId)` then settle via the same invalidate contract — do not invent a second local list SoT.
- Jobs Cap/Playbook start may optimistically seed `jobsKeys.all(caseId)` + `jobsKeys.detail(caseId, jobId)` from the mutation result **before** `onJobIdChange` / `invalidateAfterJobMutation`, so URL selection does not Navigate-flicker while the list settles.

## Mutations → UI

1. `useMutation` → serverFn (toast on failure; global query errors toast via `QueryCache.onError`).
2. On success: named invalidation contract (not imperative list `refresh()`).
3. Case switch: `notifyCasesChanged()` + `invalidateAfterCaseSwitch`.
4. Worker finishes later: SSE → same contracts.

## ServerFn boundary (reminder)

```
UI / loader  →  queries.ts (queryOptions) → *.functions.ts (createServerFn)
                                                    ↓ global requireAuth (start.ts)
                                               *.server.ts / orpcForActor / @watchdog/core / db
```

UI never imports `*.server.ts` directly. Auth is global `functionMiddleware` — not per-fn middleware.

## Evidence / artifacts

- Evidence rows: `intake` domain (`evidenceListQuery` / upload Fns) — one row per dump; Enrich/Process internals stay on the Job. Dossier Evidence tab dumps with `entityId` set (same Fns; `useDumpEvidence`).
- Collect Evidence detail tabs: **Content** (dump) · **Output** (latest Enrich `enriched.md`) · **Runs**.
- Artifact **display** text: `artifactContentQuery` (`useQuery`) — Collect run detail + Evidence detail.
- Evidence Content tab blob/text: `hooks/use-evidence-blob.ts` (`useQuery` on download URL + artifact content; parent passes loaded evidence row).
- Blobs: MinIO via presigned PUT; see platform ARCHITECTURE Evidence / Export sections.

## Tables

Client-side sort/filter/page via `shared/ui/data-table` is correct for Day-0 case-scoped lists. Hoist `globalFilterFn` (stable reference). Entities / Identifiers use dense defaults + `EditableTextCell` / append-row composer (`DataTableAddRow`) where the surface edits inline. Every column needs TanStack `size` — `DataTable` maps those to a `<colgroup>` (see [`tables.md`](ui/tables.md#table-columns)). **Loading:** `pending={listPending(...)}` renders skeleton bars per cell — never `PendingRegion` on table bodies ([`tables.md`](ui/tables.md)). Entities: `entities/hooks/use-entity-table.ts` (`entityGlobalFilterFn` from `entity-table.columns.tsx`). Identifiers: `entities/hooks/use-identifiers-table.ts` (`identifiersGlobalFilterFn` from `identifiers-table.columns.tsx`); Type / Status / Confidence via TanStack `columnFilters`. Cases use a searchable card grid + New Case dialog. Virtualization / server paging later when volume demands.

## Gotchas

- **No QueryClient singleton**: only `createAppQueryClient()` inside `getRouter()`. Never `export const queryClient = new QueryClient()`.
- **SSE**: one `listenForEvents` connection per browser tab (dedicated postgres.js conn — see [`packages/db/AGENTS.md`](../../../packages/db/AGENTS.md)). Prefer one `useLiveEvents` listener per surface tree — nested sections should pass `live: false` into `useTaskWorkspace` when the parent already invalidates on `task_changed`.
