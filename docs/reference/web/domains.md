# Domains: `src/domains/`

Where each product surface lives and where I/O is allowed. File-level detail is in the code; this page holds the folder-shape contract, the page-ownership table, and the cross-domain rules. Unless a row names an enforcer, a rule here is `guidance`. UI mechanics: [`ui/`](ui/README.md); investigator conventions: [`ux.md`](../../explanation/ux.md); data rules: [`data.md`](data.md).

## Shape

Omit files that have no clear responsibility.

```
domains/{noun}/
  components/              # React UI: imports queries + *.functions + types + hooks
  types.ts                 # DTOs + Zod input schemas (no vocab re-export)
  queries.ts               # queryOptions + key factories (import Fns; no side effects)
  {noun}.functions.ts      # RPC surface: createServerFn -> orpcFromContext(context)
  {noun}.server.ts         # rare web-local secrets/cookies (no Drizzle)
  hooks/                   # React hooks (workspace, forms, Query): no createServerFn, no *.server
  lib/                     # pure helpers (filters, views, formOptions, status maps)
```

| File | Owns | UI may import? |
| --- | --- | --- |
| `*.functions.ts` | `createServerFn` + `.validator(schema)` + thin `orpcFromContext` handlers | Yes |
| `*.server.ts` | Rare web-local secrets or cookies (`server-only`), never SQL | No |
| `types.ts` | DTOs + Zod input schemas (record types are aliased from `@watchdog/core`, not re-exported) | Yes |
| `queries.ts` | `queryOptions` + keys only | Yes |
| `hooks/*` | Client hooks that call Fns, Query, or local UI state | Yes |
| `lib/*` | Pure filters, status maps, `formOptions`, browser helpers | Yes |
| `*.client.ts` | True browser-only utils (rare) | Client only |

Naming: `*.functions` are things you call across the network (RPC, not "client code"); `*.server` must never ship to the browser; `*.client` is wrong for server functions (they run on the server during SSR and loaders).

**`lib/` vs `hooks/` is guidance, not a rule.** The intent: pure helpers in `lib/`, React hooks in `hooks/`. Nothing enforces it and four hooks already sit elsewhere (`entities/lib/use-bulk-add-identifiers-{paste,import}.ts`, `organization/lib/use-slug-availability.ts`, `tasks/components/use-task-form-dialog.ts`); move them when you touch them rather than copying the pattern. Cross-domain plumbing hooks live in `shared/hooks/` (`use-live-events`); UI-kit hooks sit beside their atom.

Graph children live in `domains/entities/{claims,identifiers,edges,events,questions}/`, each with `types.ts` and its own `*.functions.ts`. Dossier chrome stays under `dossier/components/` and has no `dossier.functions.ts`. Connection create/update payloads come only from `entities/lib/edge-write.ts` (`buildCreateEdgeData` / `buildUpdateEdgeData`), used by both the Entities table and the Dossier.

## Rules

| Rule | Enforced by |
| --- | --- |
| Never import `@watchdog/db` from web (auth's db access lives in `@watchdog/auth`; `routes/api/events.ts` goes through `@watchdog/core`) | oxlint `no-restricted-imports` |
| No `createServerFn` in `components/`, `hooks/`, `lib/`, or `queries.ts` | `guidance` |
| `*.server.ts` is never imported from client components, `lib/`, or `hooks/`; hooks call `*.functions` only | `guidance` (Start's import protection may fail a client build) |
| Handlers call `orpcFromContext(context)` for domain I/O | `guidance` |
| Domains with RPC inputs keep Zod in `types.ts`; DTO and form-value types never live in `components/` | `guidance` |
| Domains with server lists keep `queries.ts` and invalidate through `shared/lib/query-invalidation.ts` | `guidance` |
| Predicate, confidence, and kind options come from `@watchdog/schemas` (labels from `shared/ui/vocab/`); don't re-export them through domain `types.ts` | `typecheck` for the unions; otherwise `guidance` |
| Client code imports the `@watchdog/policy` subpaths (`@watchdog/policy/patch-needs-confidence`, `@watchdog/policy/confirmed-evidence`), never the `@watchdog/policy` barrel (Effect stays off the client) | `guidance` |
| One noun is one product concern (no Cap run chrome under Triage); prefer `@/domains/{noun}/...` imports | `guidance` |

## Map

| Domain | Owns | Route(s) |
| --- | --- | --- |
| `collect` | Evidence ingress + Cap/Job runs in one queue | `/collect` |
| `triage` | Proposals: accept / reject | `/triage` |
| `intake` | Evidence RPC + shared Evidence detail components | via Collect |
| `jobs` | Cap Jobs RPC + shared job detail and run forms | via Collect |
| `entities` | Entity CRUD + graph children, Entities and Identifiers tables | `/entities`, `/identifiers` |
| `dossier` | Subject dossier chrome and section editors | `/entities/$slug` |
| `cases` | Case list, Case Overview, case graph, active Case context | `/cases`, `/cases/$caseSlug`, `/graph` |
| `tasks` | Case work board + dossier Tasks tab | `/tasks` |
| `organization` | Onboarding, org switcher, Organization settings | `/onboarding`, `/settings?tab=organization`, `members`, `organizations` |
| `settings` | Settings shell, Cap credentials UI, instance-admin Users | `/settings` |
| `activity` | Cross-case recent activity read model | data-only |
| `search` | Shell Mod+K palette, Shortcuts dialog, inset ContextMenu chrome | shell chrome |
| `dashboard` | Stats, Triage and Due panels, resizable Activity | `/` |

Auth is not a domain: runtime, plugins, and the copied Better Auth UI live under `src/auth/` ([`ui/auth-ui.md`](ui/auth-ui.md)); `requireAuth` is wired globally in `src/start.ts`; server core is `@watchdog/auth`. Shared chrome lives under `src/shared/`.

## Page ownership

One copy of "layout kind to who owns the Page, loader, and pending UI". The domain entry owns `<Page>` + `PageHeader` everywhere except Settings ([`page-shell.md`](ui/page-shell.md)).

| Layout kind | Route loader | Pending UI (in the domain entry) |
| --- | --- | --- |
| **Split Queue** (Collect, Triage) | Collect: identity + awaited `ensureCollectQueueQueries` (+ job detail when `?id=`). Triage: identity + `warmTriageQueries` | `<Page density="split">` + `SplitView`; `PendingRegion` only on cache miss (Collect), `TriageSplitPendingFallback` (Triage) |
| **Table** (`/entities`, `/identifiers`) | identity + `warmEntitiesQueries` / `warmIdentifiersQueries` | `DataTable pending={listPending(...)}` ([`tables.md`](ui/tables.md)) |
| **Board** (`/tasks`) | identity + `warmTasksQueries` | `PendingRegion` + `BoardSkeleton` |
| **Card grid** (`/cases`) | identity only | `PendingRegion` + `CardGridSkeleton` |
| **Graph** (`/graph`) | identity + `ensureGraphQueries` | `GraphCanvasLoadingRegion` |
| **Stack** (Dossier, Case Overview) | identity + `warmDossierQueries` / `warmCaseOverviewQueries` | `ActiveTabBody` + `stackPendingFallback()`; Case Overview uses `CaseOverviewPending` |
| **Dashboard** (`/`) | identity + `warmDashboardQueries` | `Page density="split"`; `PendingRegion` + hand skeletons (not `stackPendingFallback`) |
| **Settings** | route owns `<Page>` + `PageHeader` | `SettingsShell` tab panels; credentials tab uses `stackPendingFallback(1)` |

## Cross-domain rules

| Need | Do |
| --- | --- |
| Entity picker | `EntityCombobox`: the parent passes options (no I/O in the combobox). The Dossier Evidence dump locks the Entity (`DumpDialogs entityLocked`, `useDumpEvidence`) |
| Evidence options in Dossier or Triage | Parent loads the full Case list (`evidenceListQuery(caseId)`) and passes `readonly EvidenceOption[]`; composers use `EvidencePicker`, Job-linked cites use `EvidenceCiteChips` |
| Workspaces | `useJobsWorkspace`, `useTriageWorkspace`, `useTaskWorkspace`, `useIntakeActions` own selection, queries, mutations, and SSE for their surface. Don't fork a second mutation machine for the same noun. Collect wraps the jobs workspace with `live: false` |
| Row and node menus | Pure `AppAction[]` factories (`entities/lib/entity-row-actions.ts`, `identifier-row-actions.ts`, `cases/lib/case-card-actions.ts`, `tasks/lib/task-card-actions.ts`, `dossier/lib/*-row-actions.ts`) feed both the actions menu and the row ContextMenu. Target actions only; chrome lives on the inset |
| Bulk-add identifiers | `entities/lib/parse-identifier-paste.ts` is the parse API; row errors come from schemas `validateIdentifierWrite` (don't fork a second regex set). One `useMutation` loops `createIdentifierFn`; Dossier locks the Entity |
| Palette, hotkeys, context menu | `domains/search` + `shared/lib/app-action.ts` + `shared/lib/hotkeys.ts`. `SearchChrome` registers Mod+K and `?`; Mod+B belongs to the vendored `SidebarProvider` ([`atoms.md`](ui/atoms.md#keyboard)) |
| Triage Accept | Policy lives in core and [`custody`](../contracts/custody.md); UX-only rules in [`ux.md`](../../explanation/ux.md#triage-accept-ux-only-rules). The Accept gate uses `shared/lib/confirmed-evidence.ts` |

## Anti-patterns

- A new `createServerFn` inside a component file.
- Importing `*.server.ts` from a client component or `lib/`.
- Fetching or mutating inside a `shared/ui` atom.
- Duplicating Queue/Detail chrome instead of the shared atoms.
- Dossier section logic under `entities/components/` (the Connections cell and `edge-write` are the sanctioned overlap).
- Graph child RPC under `entities/lib/` (use `entities/{child}/`; `edge-write.ts` is payload builders, not RPC).
- A global busy flag that remounts Entities columns; keep `saving` local to the open cell.
- A toast plus an inline error for the same mutation.

## Gotchas

- **Dashboard Activity:** the cross-case feed has no SSE type; rows link to `/cases/$caseSlug` only (resolve the slug from Cases context), because cookie-scoped routes like `/collect` must not be deep-linked at a foreign Case. The Case filter lives on that section alone. Task rows come from the append-only `activity` log (create, `status_changed`, delete; `FEED_ACTIONS` in core), whose ids are numeric text, not uuids so `from -> to` diffs are real; evidence, jobs, and pending proposals are still live-row snapshots. Show `By` + handle (or `api-key:...`), never a raw `actorId`.
- **Vocab in UI:** connection create stores `{predicate, orientation}`; encode and decode phrases only at the `FieldCombobox` boundary (`edgePhraseValue` / `parseEdgePhraseValue`). Use `preferredEdgePhrase` / `clampEdgePhrase` for kind-pair defaults.
- **Task due dates:** persist with `dueDateToIso` (local noon ISO) so calendar-day semantics survive timezone display; overdue is day-based (`isTaskDueOverdue`), and "due soon" is today + 7 days excluding overdue (`isTaskDueSoon`).
- **Task board drag:** cross-column changes status; within-column persists order via `reorderTasks` (`position`, then `createdAt`). `reconcileItems` keeps optimistic placement across refetch.
- **Ids at the edge (ADR-0003):** a route param, search param, cookie or SSE id is plain text until parsed. Parse a Case id with `parseTrimmedCaseId` (loaders, API routes: 404 on `null`), `caseIdSchema` / `trimmedCaseIdSchema` / `optionalCaseIdSchema` (zod `validateSearch` and server-function inputs), and any other uuid with `parseTrimmedUuid`; never cast to a brand. `readActiveCaseId` returns `CaseId | null`. Query filters and keys keep plain strings (the brand is minted when `query-ingress` parses them); result records stay plain until ADR-0003 phase 2.
