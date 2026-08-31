# Testing: `@watchdog/web`

**What this is:** what to run before merging web UI, and which flows Playwright already covers.  
**Not:** Cap/schema test details (platform index: [`docs/contributing/testing/index.md`](index.md); methodology: [`docs/contributing/testing/standards.md`](standards.md)).

## Required gates (web UI)

From repo root (`nix develop` on this machine):

```bash
pnpm --filter @watchdog/web typecheck   # app tsc (excludes shared/ui/shadcn)
pnpm --filter @watchdog/web ds:check    # typecheck + ds:ban greps
```

| Check | Covers |
| --- | --- |
| `typecheck` | App + hand-owned `shared/ui/**` (excludes `shadcn/` + `use-mobile`) |
| `ds:check` | `typecheck` + design-system ban greps |
| `ds:ban` | SectionLabel SoT, freestyle palette in domains, opaque-id `.slice`, WD manifest (`shared/ui` excl. `shadcn/` + `__tests__/`), **loading doctrine bans** (RoutePending in routes, domain skeleton imports, …: [`loading.md`](../../reference/web/ui/loading.md)) |

Dirty UI paths also trip `.cursor/hooks/stop-gate.mjs` (runs `ds:ban` when web UI paths are dirty): fix violations before ending the turn.

## Automated (web)

```bash
pnpm test:unit            # packages + worker only (web is not in this project)
pnpm test:component       # all `apps/web/src/**/__tests__/**` (lib `*.test.ts` + `*.component.test.tsx`)
pnpm test:e2e             # 16 tests under e2e/specs (needs `just up` or `just test-db` + MinIO; Playwright starts web+worker)
pnpm test:e2e:smoke       # @smoke + @custody (15 tests)
pnpm test:e2e:journey     # @journey only (core loop)
```

Playwright covers the core loop (Collect → Harvest → Triage Accept → Identifiers), custody Accept gates, route smoke, auth sign-up, case create, Collect paste, and Triage reject. Lib tests pin Collect queue filters, jobs domain detail/run-input/status, Dossier confirmed-evidence + claim form, Triage filters/evidence/decide-header + Accept disable (`TriagePatchBody`), intake evidence helpers, Tasks due-date + form, connection table writes (`unverified` / `related_to` notes), identifier commit (handle-without-platform), paste error aliases, dashboard selectors, case overview activity, jump-nav, queue-selection, prefetch **`warm*Queries`**, **`listPending`**, `slugifyName`, and display helpers (`formatOpaqueId` / `group-by-day`). Component: Accept gate copy, bulk-add preview, Triage Accept disable, **`RegionBoundary`**, **`LoadingRegion`**, **`DataTable` pending**, skeletons. Remaining smoke below is layout, live Query/SSE, vault Settings, and chrome that has no lib contract.

Examples: `shared/layout/__tests__/page-trail.test.ts`, `domains/jobs/lib/__tests__/jobs-views.test.ts`, `domains/triage/lib/__tests__/triage-patch-body.component.test.tsx`, `routes/__tests__/collect-index.component.test.tsx`, `routes/__tests__/triage-index.component.test.tsx`, `lib/__tests__/orpc-null-if-not-found.test.ts`.

## Backend / Caps (packages)

Greenfield Cap, core, policy, schema, and tools tests are Vitest. Put suites in a sibling `__tests__/` dir (not next to the source file). Root `pnpm test` is unit+property only.

```
packages/caps/src/evidence/harvest/__tests__/harvest.test.ts
packages/caps/src/network/dns.lookup/__tests__/interpret.test.ts
packages/caps/src/network/dns.lookup/__tests__/run.test.ts
packages/tools/src/html/__tests__/to-text.test.ts
packages/policy/src/__tests__/patch-gates.test.ts
packages/core/src/jobs/__tests__/load-cap-report.test.ts
packages/core/src/graph/__tests__/parse-agent-patch.test.ts
packages/schemas/src/__tests__/platforms.test.ts
```

Web does **not** re-test Cap handlers. If a mutation is wrong, fix/test `@watchdog/core` / `@watchdog/policy` (or Cap), then smoke the page.

## What's intentionally absent

| Kind | Status |
| --- | --- |
| Visual regression | Not set up |
| Full browser automation | Partial: 16 Playwright tests in 7 spec files (`e2e/specs/`); Cap runs, Settings vault, Tasks drag, export zip still manual: see platform [`docs/contributing/testing/index.md`](index.md) |

## Manual smoke (split pages)

With `just up`, migrated DB, `pnpm dev:web` (+ worker for Cap runs):

1. **Collect**: pick Case → paste/file dump → row appears in queue; Detail shows Content/Output/Jobs tabs; CapMatch paste / Cap select → start a Cap → job row appears without page flicker; Detail shows log/output; missing vault key → Run disabled. Cancel mid-run → `cancelled` within ~2s. Hard-kill + restart worker → stale `running` Jobs fail via `reconcileStaleJobs`. Optional: `wd evidence hide|restore|download|process|enrich`, `wd jobs start`.
2. **Triage**: first paint pending-only (clear filters for history); accept/reject a Proposal (single TX) → queue updates; confirmed without evidence blocked; agent-sourced rows show **agent** badge (no override badge). Same Identifier `type+value` on another Entity → warn Alert (Accept still works). Cap junk Identifier op (e.g. bad email) → Invalid value chip + Accept disabled. 2b. **CLI agents (optional)**: `wd proposals create` lands Triage; `wd graph write` mutates Graph at unverified; child writes need `--user-override` (needs API key).
3. **Dossier**: open entity → trail folder + `{name} / Entities / {name}` (kind badge + editable last crumb); click Case → Overview; click Entities → table; PageHeader line tabs. Overview Summary + Notes tab use `RichTextEditor` (Markdown string SoT, blur-autosave); **Edit** opens `DossierEditDialog` (name / kind / summary / notes: same Plate fields); Notes tab fills the page (`density="split"`). Edit a section → Query invalidation + live `entity_changed` keep counts/lists sane (incl. case-wide identifiers/edges caches); identifier/claim confirmed needs `EvidencePicker`; create+link Evidence is one TX. **Identifiers**: **Bulk add** (ghost, next to Add): paste → Continue → left/right column match (type from header/values) → editable preview → import; Entity is locked to the current subject (Entity column ignored). Handle without platform is blocked. Bad email / phone / url / domain / ip / pgp rejected in Add identifier (and inline edit / bulk). **Evidence**: File / Paste / URL dump with Entity locked (dropzone + dialogs); rows also appear in Collect; row click → preview Drawer (Process / Enrich / Hide stay on Collect). **Questions**: textarea composer; click text or row menu to edit (resolved can edit note); check or menu to resolve; reopen from resolved menu. **Connections**: Add/Edit dialog (grouped phrase picker + peer + confidence/evidence; peer change clamps via `clampEdgePhrase`); list edit/remove; canvas is read-only (edge click → edit; peer node → peer dossier).
4. **Cases / Case Overview**: Manage Cases: **Open** sets Active + Overview; Select sets Active only; New Case dialog; export; **Delete** type-to-confirm (card ⋯ or Overview) cascades the Case. Overview trail `Cases / {folder} {name}` (click `Cases` → manage list; no `← Cases`). Rename on Overview settings regenerates slug and replace-navigates. Overview = stats / activity / settings (no line tabs). Stat tiles → `/entities`, `/identifiers`, `/graph`, `/collect`, `/triage`. UUID/`?tab=` bookmarks redirect. 4b. **Entities table Connections**: create org + infra → Connections **Add** → relationship defaults to `primary_domain` after peer pick; Save → chips refresh without opening dossier. Chip click → edit (prefilled); `+N` → browse list (not create). Row click still opens dossier (Add/chips are buttons). Table writes stay `unverified` / no evidence; `related_to` requires notes. **Loading:** cold nav skeleton bars align under column headers ([`tables.md`](../../reference/web/ui/tables.md)). 4c. **Identifiers table**: `/identifiers` (Case switcher): SearchField + Type/Status/Confidence filters, inline edit, evidence link, in-place create (Entity picker + Value first); **Bulk add** (outline, next to Add identifier) two-stage paste → left/right match → editable preview → import (default Entity fills empty Entity cells; mapped name/slug miss shows **Not found** / **Ambiguous**; type from columns/values; `confirmed` → `unverified`); empty table keeps add-row; row click → Dossier Identifiers (interactive cells are buttons so they don't steal the row). Handle without platform is blocked. **Loading:** throttle network on cold nav: skeleton bars align under each column header (no blank row; not `PendingRegion`: [`tables.md`](../../reference/web/ui/tables.md)). 4d. **Graph**: `/graph` hosts case-wide preview canvas; node → dossier.
5. **Tasks**: `/tasks` kanban only: New task / lane quick-create; drag between status columns (status change only); edit dialog (title, priority, date-only due, entity); Dossier Tasks tab = entity-scoped board; Task is not a Graph write.
6. **Settings**: sidebar `?tab=` (Account / Security / API Keys / Credentials); Cap credentials list + Connect/Update dialog (vault).
7. **Dashboard**: `/` trail last crumb Dashboard; 3×2 stat cards; Triage + Due panels (dashed empty when clear); Activity in a resizable bottom panel (`ScrollArea`) with case filter; Active Case switch re-scopes stats/lists (Activity stays cross-case unless filtered).
8. **Case switch**: change Active Case → lists re-scope (no stale other-Case rows).
9. **Cmd+K / hotkeys**: Mod+K (or sidebar Search…) opens palette; idle Jump to; type entity name → Enter → dossier; `?` → Shortcuts sheet; Mod+B still toggles sidebar.
10. **PageHeader trail**: Work page shows folder + `{name} / Collect` (etc.); dossier folder + `{name} / Entities / {name}`; click Case → Overview; click Entities → table. Entities / Identifiers / Tasks last crumb shows `TabCount` (hidden at 0); leave the page and the pill drops with the title. No Active Case → Case crumb omitted. No explainer suffix in the bar.

`/ui` gallery: Foundations + Atoms specimens (required atom coverage for `ds:check`).

## When you change loading or skeletons

- Match a route to [`loading.md`](../../reference/web/ui/loading.md): shell-first, one pending surface per region, error granularity via `RegionBoundary`.
- Tables: **`DataTable` `pending` only**: never `PendingRegion` ([§ Tables](../../reference/web/ui/tables.md)).
- New `useSuspenseQuery` on a warmed page: update the matching `warm*Queries` helper in the same PR ([`DATA.md`](../../reference/web/data.md) parity table).

## When you change chrome

- Touch `shared/ui` hand-owned atom → keep it out of `shadcn/`; update `wd-ui-files.mjs` + a `COMPONENTS.md` row, then `ds:check`. Suites under `shared/ui/__tests__/` are **not** atoms: do not list them in the manifest.
- After `shadcn add` → files land in `shared/ui/shadcn/`; run `pnpm shadcn:nocheck`.
- Rename lexicon words → update [`UI.md`](../../reference/web/UI.md) / [`docs/explanation/ux.md`](../../explanation/ux.md) if product meaning changed; run typecheck.
