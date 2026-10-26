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
| `intake` | Evidence RPC + shared Evidence detail components; the Evidence detail "Calls" tab lists the provider calls behind the Evidence (`evidenceProviderCallsQuery`, `ProviderCallsSection` from `jobs`) | via Collect |
| `jobs` | Cap Jobs RPC + shared job detail and run forms; the job detail "Calls" tab and the Evidence detail one share `ProviderCallsSection` (`components/provider-calls/`): each call as method, redacted URL as text (never a link), result, transport, time, duration, response-body state with size and the provider content type, body hash (`IdChip`), Cap and version, and a download of a stored raw response (an attachment route, `providerCallResponsePath`); a record with a gap shows an incomplete warning, never "no calls", and a cache hit names its source Job only when it is in the Case (`jobProviderCallsQuery`, read only while the tab is open); Retry and Edit and re-run on finished Jobs, attempt chain from `retryOfJobId`; the Playbook spine shows each recipe step's outcome (succeeded, failed, running, pending, or skipped with its reason) and the run's outcome from `playbookRunQuery` (`jobs.getPlaybookRun`), falling back to the run's Jobs while it loads (`lib/playbook-run-view.ts`); the Collect queue row adds a `Partial` or `Failed` chip for a finished run, and a step a retry replaced no longer counts as failed (`currentAttempts`) | via Collect |
| `entities` | Entity CRUD + graph children, Entities and Identifiers tables | `/cases/$caseSlug/entities`, `/cases/$caseSlug/identifiers` |
| `dossier` | Subject dossier chrome and section editors | `/cases/$caseSlug/entities/$slug` |
| `cases` | Case list, Case Overview, case graph, active Case context; delete (a restorable tombstone), the Deleted Cases view and the deleted-Case screen | `/cases`, `/cases/$caseSlug`, `/cases/$caseSlug/graph`, `/deleted-cases` |
| `tasks` | Case work board + dossier Tasks tab | `/cases/$caseSlug/tasks` |
| `organization` | Onboarding (organization, then the first-Case step: `domains/cases` `CreateCaseForm`), org switcher, Organization settings | `/onboarding`, `/settings?tab=organization`, `members`, `organizations` |
| `settings` | Settings shell, Cap credentials UI, instance-admin Users | `/settings` |
| `activity` | Cross-case recent activity read model | data-only |
| `search` | Shell Mod+K palette, Shortcuts dialog, inset ContextMenu chrome | shell chrome |
| `library` | The Library: every Cap and Playbook for the organization (not Case-scoped), a card grid (the Cases pattern, `CASE_CARD_SHELL_CLASS`) with a category rail (All, Playbooks, then each Cap category), search, the "start from what you have" input-kind filter (an index built from each Cap's `consumes` and each Playbook's `seedKinds`), ready-first order, and filters for readiness, third-party egress and provider commercial use. Readiness for the viewer is `libraryReadiness` over `catalogGate` (`jobs/lib/credential-gate.ts`), the same gate Collect's Cap and Playbook run forms use, fed by the catalog reads and the vault slot list: Ready, Missing API key (links to Settings, Credentials), Off by the operator (`breach_disabled`), or Unavailable when the vault cannot be read. Egress is a separate mark, since the allowed egress classes are per Case. No usage statistics. Two banners sit above the cards: quick picks for the most common input kinds, and "Add API keys to unlock N Caps and Playbooks" (a readiness count, shown only when some entries need a key). A card shows a readiness badge only when the entry is not Ready. Each card is one link to the entry's own full page, one layout for both kinds (`LibraryEntryLayout`): a header (input-kind tile, category eyebrow, title, kind chip and the egress mark) over a main column, which ends with **Run on…**, beside a sticky aside with a hairline from the top of the page and no box (the readiness note first when the entry is not Ready), and a "More in {category}" row of real cards: up to three other entries of the category (`relatedEntries`). A Cap's page (`/library/caps/$capId`, `LibraryCapDetail`; the `library_` route stays out of the `/library` layout) shows the facts (takes, returns, data, plan, keys, timeout), a "How it works" flow (what you give, the Cap run by its provider or this server, what you get; kinds link into the input-kind filter), Behaviour (timeout, cache, flags, privacy), the Playbooks that include it with their step counts, and in the aside the provider, plan, commercial use, terms (`ExternalHostLink`, hostname only), data source, credit and each key marked configured or missing (`buildCapRequirements`), all read from the Cap descriptor (`lib/cap-detail.ts`). **Run on…** picks a Case and opens its Collect with `?run=cap:<id>` or `?run=playbook:<id>`; Collect opens the Run form on that entry once and strips the param, and it is off, with the reason, until the entry is ready. A Playbook's page (`/library/playbooks/$playbookId`, `LibraryPlaybookDetail`) shows the facts (steps, stages, starts from, providers, keys needed, data), "How it runs" as left-to-right stage columns (`lib/playbook-stages.ts` over `lib/playbook-graph.ts`, a readiness dot per step) with a "What if a step fails?" control under it (None or a step) that marks the failing step and dims what it skips, and the readiness roll-up over its steps (each through its Cap's `libraryReadiness`); the seed kinds in the aside link to the input-kind view; the dependencies come from the Playbook catalog's `stepDependencies` (the transitive `playbookStepDependencies`). Both pages share `LibraryEntryLoader` (a `LibraryEntrySkeleton` while loading, a failed read with Retry, not found). Job Detail links its Cap with "About this Cap". The category and every filter live in the URL (`cat`, `q`, `kind`, `status`, `third`, `use`) | `/library`, `/library/caps/$capId`, `/library/playbooks/$playbookId` |
| `dashboard` | Stats, Triage and Due panels, resizable Activity | `/` |

Auth is not a domain: runtime, plugins, and the copied Better Auth UI live under `src/auth/` ([`ui/auth-ui.md`](ui/auth-ui.md)); `requireAuth` is wired globally in `src/start.ts`; server core is `@watchdog/auth`. Shared chrome lives under `src/shared/`.

## Page ownership

One copy of "layout kind to who owns the Page, loader, and pending UI". The domain entry owns `<Page>` + `PageHeader` everywhere except Settings ([`page-shell.md`](ui/page-shell.md)).

| Layout kind | Route loader | Pending UI (in the domain entry) |
| --- | --- | --- |
| **Split Queue** (Collect, Triage) | Collect: identity + `warmCollectQueries` (+ the selected row when `?id=`). Triage: identity + `warmTriageQueries` (the URL's first queue page) | `<Page density="split">` + `SplitView`; `PendingRegion` (Collect queue and detail, Triage detail), `ListBody` (Triage queue) |
| **Card grid, organization-wide** (`/library`) | `warmLibraryQueries` (catalog, Playbooks, vault slots; not blocking) | `<Page>` + `PageToolbar`, category rail and card grid; `LibraryRailSkeleton` beside a `PendingRegion` with `LibraryContentSkeleton` (the real rail, both banners, card and grid boxes from `shared/ui/library-shell.ts`) |
| **Library entry page** (`/library/caps/$capId`, `/library/playbooks/$playbookId`) | `warmLibraryQueries` | `<Page>` + `LibraryEntryLoader`; `LibraryEntrySkeleton` in a `LoadingRegion` (header and both columns in the real boxes from `library-shell.ts`) |
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
| A route tab list lives once in the owning lib under a SCREAMING constant, and the type derives from it: Dossier tabs `DOSSIER_TABS` (`dossier/lib/dossier-tabs.ts`, also read by `prefetch-dossier.ts` and `Dossier`) and `SETTINGS_TABS` (`settings-shell.tsx`, which the Settings route imports); an unknown tab name is no tab (`tabSearchParam`) | `guidance` |
| A `?tab=` param is parsed by `tabSearchParam` (`shared/lib/tab-search.ts`) inside the route's `validateSearch`: padded values are trimmed, anything that is not a known tab is absent and the screen shows its default tab. A loader that needs the tab parses `location.search` with the same schema; no component re-validates a tab string | tests: `tab-search.test.ts`, `dossier-tabs.test.ts` and the route component tests (`entity-slug`, `case-slug`, `settings-index`); a hand-written parser is `guidance` |
| The Active-Case rule lives in core (`resolveActiveCaseEffect`, `packages/core/src/cases/cases.ts`): the stored id (cookie) stays Active while the organization can see that Case, else the first visible Case, else none. `cases-active.server.ts` runs it for the session's organization; `getCasesContextFn` and `deleteCaseFn` write the cookie from its answer. `healActiveCaseFn` (`cases.functions.ts`) is the compare-and-set cookie write behind `/cases/$slug`, org-checked through `cases.get`. The loader only calls it | `active-case.int.test.ts` (real Postgres), `cases-active.server.test.ts`, `cases.functions.test.ts`, `case-slug.component.test.tsx` |
| A REST path the web links to or fetches directly comes from `shared/lib/api-urls.ts` (`caseExportZipPath`, `entityMarkdownExportPath`) | `api-urls.test.ts` pins the paths; a hand-built `/api/v1/` string is `guidance` |
| Routes read the URL through the router, not `window.location` | `guidance` (no clean lint rule: oxlint has no `no-restricted-syntax`, and `no-restricted-globals` misses `window.location`) |

## Cross-domain rules

| Need | Do |
| --- | --- |
| Entity picker | `SearchedEntityCombobox` over `entityPickerPort(caseId)` (server search, value titled by id) on the Identifiers table, the Dossier and the Task dialog; `EntityCombobox` with options the parent passes elsewhere (no I/O in the combobox). The Dossier Evidence dump locks the Entity (`DumpDialogs isEntityLocked`, `useDumpEvidence`) |
| Evidence options in Dossier, Identifiers or Triage | Dossier and Identifiers composers and cells use `SearchedEvidencePicker` over `evidencePickerPort(caseId)` and title linked Evidence with `useRecordsByIds` (#559); Triage's Accept picker is the same `SearchedEvidencePicker`, and the Evidence a Proposal cites is titled by `useRecordsByIdsState` (#580), never the Case's whole list; Job-linked cites use `EvidenceCiteChips` |
| Workspaces | `useJobsWorkspace`, `useTriageWorkspace`, `useTaskWorkspace`, `useIntakeActions` own selection, queries, mutations, and SSE for their surface. Don't fork a second mutation machine for the same noun. |
| Row and node menus | Pure `AppAction[]` factories (`entities/lib/entity-row-actions.ts`, `shared/ui/identifiers/identifier-row-actions.ts` (shared by the Identifiers page and the Dossier tab), `cases/lib/case-card-actions.ts`, `tasks/lib/task-card-actions.ts`, `dossier/lib/*-row-actions.ts`) feed both the actions menu and the row ContextMenu. Target actions only; chrome lives on the inset |
| Row history | `RowHistory` (`dossier/components/row-history.tsx`) is the history popover of one Graph row (who created and last changed it, then its changes newest first, "Show older" by cursor). It rides in `TargetActionsHost`'s `trailing` slot (claims and questions through `rowHistorySlot`, events, connections) or `IdentifierTableActions.renderHistory` (identifiers) and in the Summary header (the Entity). The query is `graphHistoryQuery` (`entities/history/queries.ts`, `historyKeys`); the popup mounts only when opened, so a row nobody asks about reads nothing. `invalidateAfterEntityChanged`, graph activity and Accept invalidate `historyKeys.prefix(caseId)` |
| Bulk-add identifiers | `entities/lib/parse-identifier-paste.ts` is the parse API; row errors come from schemas `validateIdentifierWrite` (don't fork a second regex set). One `useMutation` loops `createIdentifierFn`; Dossier locks the Entity |
| Palette, hotkeys, context menu | `domains/search` + `shared/lib/app-action.ts` + `shared/lib/hotkeys.ts`. `HOTKEYS` is the one shortcut registry; `SearchChrome` binds its `global` entries (Mod+K, `?`) and Mod+B belongs to the vendored `SidebarProvider` ([`atoms.md`](ui/atoms.md#keyboard)) |
| External AI handoff ("Open in Claude" / "Open in ChatGPT") | Never open the chat directly: `useAiHandoff` (`dossier/hooks/`) reads and sizes the Markdown (`prepareAiHandoff`), `AiHandoffDialog` names the destination, the Entity and the size, and only the confirm opens a blank tab in the click (`openAiHandoffTab`, with `opener` cut: a tab opened after an await is pop-up blocked) and calls `confirmAiHandoff` in `entities/lib/entity-export.ts`, which records the handoff on the server (`recordAiHandoffFn`, an activity entry with actor, Entity and destination, never the text) before the tab loads the chat; a refused record closes the tab. The menu items render only while `organizationSettingsQuery` says `externalAiHandoff` is on (hidden while it loads or fails); an owner or admin changes it in Settings, Organization (`OrganizationAiSettings`). Tests: `dossier-export-menu.component.test.tsx` (confirm, record-then-load order, blocked tab, cancel, off), `ai-handoff.int.test.ts` (role check, entry, no text) |
| Triage Accept | Policy lives in core and [`custody`](../contracts/custody.md); UX-only rules in [`ux.md`](../../explanation/ux.md#triage-accept-ux-only-rules). The Accept gate uses `shared/lib/confirmed-evidence.ts` |

## Deleted Cases

Delete is a tombstone, so the UI treats it as reversible (#304; server contract: [`custody`](../contracts/custody.md#deletion-and-retention)).

| Piece | Rule |
| --- | --- |
| Delete dialog (`DeleteCaseDialog`) | A plain `AlertDialog` (reversible: no type-the-name gate, no "cannot be undone"). It says the Case moves to Deleted Cases, that an owner or admin can restore it for the configured window (`deletionPolicyQuery`, not a hard-coded 30), and, when the Case has queued or running Jobs, how many will be cancelled (and that a restore does not resume them). The count comes from the same policy query (`deletionPolicyQuery(caseId)`, counted by the server), so the dialog fetches no Jobs. |
| Who sees Delete | Owners and admins only, decided by the server's own check (`cases.deletionPolicy` → `canManage`). The Cases list does not offer Delete to anyone else; Case Overview shows a disabled Delete with a tooltip that says why. The server refuses a member regardless. |
| After a delete | `useCaseDeletedToast`: a success toast that names the Case with a Restore action for 8 seconds, through the same restore procedure as the Deleted Cases view. The Case is gone from the list, switcher, sidebar, palette and search at once (`dropCaseFromCaches`, then `invalidateAfterCaseSwitch`). Deleting from Case Overview navigates to `/cases`. |
| Deleted Cases page (`DeletedCasesPage`, `DeletedCasesView`) | The route `/deleted-cases` under Cases (breadcrumb Cases, Deleted Cases; a link button on the Cases list opens it; its own route, so it costs the Settings and Case routes no JavaScript). Owners and admins see the list; anyone else an inline "Only owners and admins can see deleted Cases" alert. One row per Case: name, who deleted it and when, days left to restore, Restore, and Purge now. A Case whose purge began, or whose window has ended (`daysLeft` 0), cannot be restored (Restore is disabled and a tooltip says why: `restoreBlockedReason`), and one whose last purge failed says so. It is a declared list (`deletedCaseList`, ADR-0007; `deletedCaseListView`, `useList`, [`lists.md`](lists.md)): the standard toolbar (search over name, link and description, a Purge started filter, Display options with the sort and density), a `ListBody` over the rows, a count in the header and the standard footer with Load more; the view lives in the URL (`?q=`, `?purging=true`, `?sort=`). The list has no scope: the organization comes from the caller, and the route's loader warms the first page only for an owner or admin. The blank state restates the restore window. |
| Purge now (`PurgeCaseDialog`) | `DestructiveConfirmDialog` with the typed Case name: permanent, so it says what is erased (entities, claims, evidence, jobs, history, files), that it cannot be restored, and that only a short deletion record stays. Session only: the server refuses an API key. |
| Deleted-Case URL | `/cases/<slug>` of a deleted Case: an owner or admin sees `DeletedCaseScreen` ("This Case was deleted on X by Y", Restore case, Deleted Cases, Back to Cases); anyone else sees the ordinary Case-not-found screen, and the deleted-Case lookup is not even attempted for a member. Restore is disabled with the reason when the window has ended or a purge began. Restoring returns to the Case under the slug it came back with; when its old link was taken the restore toast says the new one. |
| Export | A deleted Case cannot be exported (`export.zip` answers 404) until it is restored. The Export buttons (`exportCaseZip`) probe `export.zip`: 200 hands the URL to the browser, which streams the download; 202 means the Case is large and runs as a Job, so a toast says it will appear in Recent activity, and the Job's detail has the expiring Download export button (`JobExportDownload`). An export Job has no Retry (it is not a Cap). The archive always has `provider-calls.jsonl`, `ATTRIBUTION.md` and `VERIFY.md`. Owners and admins (`policy.canManage`) also see Export with responses, which probes `export.zip?rawBodies=1` and adds the raw provider responses each host's terms allow; a 403 says only owners and admins can. In `full` breach mode, owners and admins (`policy.canIncludeBreachCredentials`, from `deletionPolicy`) also get Include breach credentials, which probes `export.zip?breachCredentials=1`; without it breach Evidence in the archive has its passwords and hashes cut to present, kind, length and fingerprint. |

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
