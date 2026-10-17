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

**`lib/` holds no hooks** (`watchdog/no-hooks-in-lib`): pure helpers in `lib/`, React hooks in `hooks/`. Hooks sit in the domain's `hooks/` folder, cross-domain plumbing hooks in `shared/hooks/` (`use-activity-stream`, `use-global-hotkeys`), UI-kit hooks beside their atom. A hook over an external store splits in two: a framework-free store module in `shared/lib/` (private state, a small `subscribe`/`getSnapshot` plus mutators interface; `display-scale-store.ts`, `palette-commands-store.ts`) and the hook in `shared/hooks/` that calls `useSyncExternalStore` on it. `tasks/components/use-task-form-dialog.ts` is a hook in `components/`, outside the rule.

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
| Types come from `@watchdog/schemas` or the domain `types.ts` | `guidance`; `watchdog/no-types-from-functions` enforces only the ban: no type imports from, or re-exports of, a `*.functions` module, except in `*.functions.ts`, `queries.ts` and `*-queries.ts` under `domains/` |
| An import that leaves its `domains/<x>/` folder for another path under `src` uses the `@/` alias, not `../../` hops (relative paths resolving outside `src` are not checked) | `watchdog/no-cross-domain-relative-imports` |
| `shared/ui` imports no domain code | `watchdog/shared-ui-no-domain-imports` |
| No hook (`use*`) is defined in a `lib/` folder | `watchdog/no-hooks-in-lib` |
| A `.tsx` file exports one component; a family of parts is a folder of single-component files with an `index.ts` barrel (`shared/ui/skeletons/`) | `watchdog/one-component-per-file` |

## Map

| Domain | Owns | Route(s) |
| --- | --- | --- |
| `collect` | Evidence ingress + Cap/Job runs in one queue | `/cases/$caseSlug/collect` |
| `triage` | Proposals: accept / reject | `/cases/$caseSlug/triage` |
| `intake` | Evidence RPC + shared Evidence detail components | via Collect |
| `jobs` | Cap Jobs RPC + shared job detail and run forms; Retry and Edit and re-run on finished Jobs, attempt chain from `retryOfJobId` | via Collect |
| `entities` | Entity CRUD + graph children, Entities and Identifiers tables | `/cases/$caseSlug/entities`, `/cases/$caseSlug/identifiers` |
| `dossier` | Subject dossier chrome and section editors | `/cases/$caseSlug/entities/$slug` |
| `cases` | Case list, Case Overview, case graph, active Case context | `/cases`, `/cases/$caseSlug`, `/cases/$caseSlug/graph` |
| `tasks` | Case work board + dossier Tasks tab | `/cases/$caseSlug/tasks` |
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
| **Table** (`/cases/$caseSlug/entities`, `/cases/$caseSlug/identifiers`) | identity + `warmEntitiesQueries` / `warmIdentifiersQueries` | `DataTable pending={listPending(...)}` ([`tables.md`](ui/tables.md)) |
| **Board** (`/cases/$caseSlug/tasks`) | identity + `warmTasksQueries` | `PendingRegion` + `BoardSkeleton` |
| **Card grid** (`/cases`) | identity only | `PendingRegion` + `CardGridSkeleton` |
| **Graph** (`/cases/$caseSlug/graph`) | identity + `ensureGraphQueries` | `GraphCanvasLoadingRegion` |
| **Stack** (Dossier, Case Overview) | identity + `warmDossierQueries` / `warmCaseOverviewQueries` | `ActiveTabBody` + `stackPendingFallback()`; Case Overview uses `CaseOverviewPending` |
| **Dashboard** (`/`) | identity + `warmDashboardQueries` | `Page density="split"`; `PendingRegion` + hand skeletons (not `stackPendingFallback`) |
| **Settings** | route owns `<Page>` + `PageHeader` | `SettingsShell` tab panels; credentials tab uses `stackPendingFallback(1)` |

## Routing

| Rule | Enforced by |
| --- | --- |
| A route tab list and its legacy-name map live once in the owning lib under a SCREAMING constant, and the type derives from it: Dossier tabs `DOSSIER_TABS` and `DOSSIER_LEGACY_TABS` (`dossier/lib/dossier-tabs.ts`, also read by `prefetch-dossier.ts` and `Dossier`), Case overview legacy tabs `CASE_LEGACY_TABS` and `CASE_LEGACY_TAB_REDIRECT` (`cases/lib/case-legacy-tabs.ts`), `SETTINGS_TABS` and `SETTINGS_LEGACY_TABS` (`settings-shell.tsx`, which the Settings route imports) | `guidance` |
| A `?tab=` param is parsed by `tabSearchParam` (`shared/lib/tab-search.ts`) inside the route's `validateSearch`: padded values are trimmed, a legacy name maps to its new tab, anything else is absent and the screen shows its default tab. A loader that needs the tab parses `location.search` with the same schema; no component re-validates a tab string | tests: `tab-search.test.ts`, `dossier-tabs.test.ts` and the route component tests (`entity-slug`, `case-slug`, `settings-index`); a hand-written parser is `guidance` |
| The Active-Case rule lives in core (`resolveActiveCaseEffect`, `packages/core/src/cases/cases.ts`): the stored id (cookie) stays Active while the organization can see that Case, else the first visible Case, else none. `cases-active.server.ts` runs it for the session's organization; `getCasesContextFn` and `deleteCaseFn` write the cookie from its answer. `healActiveCaseFn` (`cases.functions.ts`) is the compare-and-set cookie write behind `/cases/$slug`, org-checked through `cases.get`. The loader only calls it | `active-case.int.test.ts` (real Postgres), `cases-active.server.test.ts`, `cases.functions.test.ts`, `case-slug.component.test.tsx` |
| A REST path the web links to or fetches directly comes from `shared/lib/api-urls.ts` (`caseExportZipPath`, `entityMarkdownExportPath`) | `api-urls.test.ts` pins the paths; a hand-built `/api/v1/` string is `guidance` |
| Routes read the URL through the router, not `window.location` | `guidance` (no clean lint rule: oxlint has no `no-restricted-syntax`, and `no-restricted-globals` misses `window.location`) |

## Cross-domain rules

| Need | Do |
| --- | --- |
| Entity picker | `EntityCombobox`: the parent passes options (no I/O in the combobox). The Dossier Evidence dump locks the Entity (`DumpDialogs isEntityLocked`, `useDumpEvidence`) |
| Evidence options in Dossier or Triage | Parent loads the full Case list (`evidenceListQuery(caseId)`) and passes `readonly EvidenceOption[]`; composers use `EvidencePicker`, Job-linked cites use `EvidenceCiteChips` |
| Workspaces | `useJobsWorkspace`, `useTriageWorkspace`, `useTaskWorkspace`, `useIntakeActions` own selection, queries, mutations, and SSE for their surface. Don't fork a second mutation machine for the same noun. |
| Row and node menus | Pure `AppAction[]` factories (`entities/lib/entity-row-actions.ts`, `shared/ui/identifiers/identifier-row-actions.ts` (shared by the Identifiers page and the Dossier tab), `cases/lib/case-card-actions.ts`, `tasks/lib/task-card-actions.ts`, `dossier/lib/*-row-actions.ts`) feed both the actions menu and the row ContextMenu. Target actions only; chrome lives on the inset |
| Bulk-add identifiers | `entities/lib/parse-identifier-paste.ts` is the parse API; row errors come from schemas `validateIdentifierWrite` (don't fork a second regex set). One `useMutation` loops `createIdentifierFn`; Dossier locks the Entity |
| Palette, hotkeys, context menu | `domains/search` + `shared/lib/app-action.ts` + `shared/lib/hotkeys.ts`. `HOTKEYS` is the one shortcut registry; `SearchChrome` binds its `global` entries (Mod+K, `?`) and Mod+B belongs to the vendored `SidebarProvider` ([`atoms.md`](ui/atoms.md#keyboard)) |
| External AI handoff ("Open in Claude" / "Open in ChatGPT") | Never open the chat directly: `useAiHandoff` (`dossier/hooks/`) reads and sizes the Markdown (`prepareAiHandoff`), `AiHandoffDialog` names the destination, the Entity and the size, and only the confirm opens a blank tab in the click (`openAiHandoffTab`, with `opener` cut: a tab opened after an await is pop-up blocked) and calls `confirmAiHandoff` in `entities/lib/entity-export.ts`, which records the handoff on the server (`recordAiHandoffFn`, an activity entry with actor, Entity and destination, never the text) before the tab loads the chat; a refused record closes the tab. The menu items render only while `organizationSettingsQuery` says `externalAiHandoff` is on (hidden while it loads or fails); an owner or admin changes it in Settings, Organization (`OrganizationAiSettings`). Tests: `dossier-export-menu.component.test.tsx` (confirm, record-then-load order, blocked tab, cancel, off), `ai-handoff.int.test.ts` (role check, entry, no text) |
| Triage Accept | Policy lives in core and [`custody`](../contracts/custody.md); UX-only rules in [`ux.md`](../../explanation/ux.md#triage-accept-ux-only-rules). The Accept gate uses `shared/lib/confirmed-evidence.ts` |

## Anti-patterns

- A new `createServerFn` inside a component file.
- Importing `*.server.ts` from a client component or `lib/`.
- Fetching or mutating inside a `shared/ui` atom.
- Duplicating Queue/Detail chrome instead of the shared atoms.
- Dossier section logic under `entities/components/` (the Connections cell and `edge-write` are the sanctioned overlap).
- Graph child RPC under `entities/lib/` (use `entities/{child}/`; `edge-write.ts` is payload builders, not RPC).
- A global busy flag that remounts Entities columns; keep `isSaving` local to the open cell.
- A toast plus an inline error for the same mutation.

## Gotchas

- **Dashboard Activity:** the cross-case feed has no SSE type; rows link to `/cases/$caseSlug` only (resolve the slug from Cases context): the feed spans Cases and its rows carry no Work screen. The Case filter lives on that section alone. Task rows come from the append-only `activity` log (create, `status_changed`, delete; `FEED_ACTIONS` in core), whose ids are numeric text, not uuids so `from -> to` diffs are real; evidence, jobs, and pending proposals are still live-row snapshots. Show `By` + handle (or `api-key:...`), never a raw `actorId`.
- **Vocab in UI:** connection create stores `{predicate, orientation}`; encode and decode phrases only at the `FieldCombobox` boundary (`edgePhraseValue` / `parseEdgePhraseValue`). Use `preferredEdgePhrase` / `clampEdgePhrase` for kind-pair defaults.
- **Task due dates:** persist with `dueDateToIso` (local noon ISO) so calendar-day semantics survive timezone display; overdue is day-based (`isTaskDueOverdue`), and "due soon" is today + 7 days excluding overdue (`isTaskDueSoon`).
- **Task board drag:** cross-column changes status; within-column persists order via `reorderTasks` (`position`, then `createdAt`). `reconcileItems` keeps optimistic placement across refetch.
- **Ids at the edge (ADR-0003):** a route param, search param, cookie or SSE id is plain text until parsed. Parse a Case id with `parseTrimmedCaseId` (loaders, API routes: 404 on `null`), `caseIdSchema` / `trimmedCaseIdSchema` / `optionalCaseIdSchema` (zod `validateSearch` and server-function inputs), and any other uuid with `parseTrimmedUuid`; never cast to a brand. `readActiveCaseId` returns `CaseId | null`. Query filters and keys keep plain strings (the brand is minted when `query-ingress` parses them); result records and API outputs carry `CaseId` (the output schemas use `caseIdSchema`; `z.output` is branded, so use a record's `caseId` / `id` directly and do not re-parse it).
