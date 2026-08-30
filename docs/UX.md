# UX — product experience

**What this is:** how investigators _use_ Watchdog — information architecture, flows, empty/error meaning, copy, experience debt.  
**What this is not:** tokens, atoms, or component naming — that is [`apps/web/docs/UI.md`](../apps/web/docs/UI.md). Product intent, personas, and doctrine live in [`PRODUCT.md`](PRODUCT.md).

Last updated: 2026-08-15 (Identifier write gate · Cmd+K search · Dossier Evidence dump · Bulk add identifiers · Delete case · Questions edit/reopen · Jobs vault preflight)

## Product principle

Operate mode: task clarity over surprise. Surfaces earn their chrome; don’t invent a second app inside a page. Core loop and refusals: [`PRODUCT.md`](PRODUCT.md).

## Information architecture

| Route | Job for the investigator | Layout kind (see UI) |
| --- | --- | --- |
| `/` | Dashboard — stats, Triage, Due, cross-case Activity | mixed (dashboard) |
| `/collect` | Dump evidence; run Caps/Playbooks; watch acquisitions | split |
| `/triage` | Accept / reject Proposals into the graph | split |
| `/entities` | Browse Case entities (+ Connections column) | table |
| `/identifiers` | Active-Case identifiers table (browse + inline edit + in-place create + bulk add) | table |
| `/graph` | Active-Case graph preview | stack (split density) |
| `/entities/$entitySlug` | Work a subject dossier (Notes tab separate from Overview) | stack |
| `/tasks` | Case work board (kanban); optional entity filter | board |
| `/cases` | Manage Cases (create / Select Active / Open / export) | card grid |
| `/cases/$caseSlug` | Case Overview — case dashboard (stats, activity, settings) | stack |
| `/settings` | Account, security, API keys, Cap credentials (`?tab=`) | stack (sidebar + form) |
| `/ui` | DS fixtures only — not a product surface | fixtures |
| `/auth/$path` | Better Auth views: `sign-in`, `sign-up`, `forgot-password`, `reset-password`, `verify-email`, `sign-out` | centered card |

## Core flows

1. **Cap run → triage** — Collect starts a Cap → worker → Evidence + Proposal → Triage Accept/Reject → graph.
2. **Playbook run → triage** — Collect **Playbook** source starts a curated Cap chain (`playbook_runs`); each step is its own Job (+ Proposal). Only the first step is queued at start; later steps are created when the prior step succeeds (fan-out siblings join before the next recipe step). Cancel run stops remaining work. Never auto-fires from a dump.
3. **Evidence in** — Collect dump (paste/file/URL) → Enrich (URL dumps; Output on the same row) → Process (optional `evidence.harvest` / `evidence.extract.ai`, labeled **Extract (AI)** in the UI) → Triage Accept. Detail tabs: Content · Output · Runs. Cap-landed Evidence (e.g. DNS lookup artifact) is labeled **Cap output**; **From {cap}** in the detail strip jumps to the Jobs tab and expands that run. Dossier Evidence tab dumps File/Paste/URL with Entity locked (same APIs; rows also appear in Collect).
4. **Dossier** — open entity → Overview (BLUF Summary via Plate Markdown + scan) / Notes (full-height Plate) / Claims / ids / connections / evidence / events / questions / **Tasks**; trail is folder + `{name} / Entities / {name}` (kind badge + blur-save name as last crumb) or **Edit** → `DossierEditDialog` (name / kind / summary / notes Markdown); click Case → Overview; click Entities → table. Evidence tab dumps onto this subject + peek via Drawer. Questions: inline edit (open + resolved), resolve, reopen.
5. **Case scope** — Active Case is cookie-scoped (not in URL for Work/graph nouns); all work is Case-bound. Sidebar: WATCHDOG logo → Dashboard (`/`); **Search…** (Mod+K) above Case; under Case: flat Overview / Entities / Identifiers / Graph. Case Overview (`/cases/$caseSlug`) is the case dashboard (stats / activity / settings); Manage **Cases** Open sets Active and lands there. Legacy `/cases/$uuid` and `?tab=` bookmarks redirect.
6. **Tasks** — case-scoped work items (not Graph writes). `/tasks` is kanban-only (fixed status columns; drag across columns changes status; drag within a column reorders via `position`; lane quick-create + header New task → full dialog). Optional `?entityId=` filter. Due dates are calendar-day only. Dossier **Tasks** tab = entity-scoped board (`density="split"`).
7. **Command palette** — Mod+K (or sidebar Search) opens a shell-mounted palette. Idle = Jump to pages. Type ≥2 chars → Active Case `searchCase` hits (Entities, Identifiers, Evidence, Tasks, Jobs, pending Triage) plus Cases (switch + Overview). `?` opens the Shortcuts sheet; Mod+B toggles the sidebar.

### Triage Accept (product rules)

- Cap/agent patch `data` **must not** include confidence — human picks on Accept.
- If the patch has any confidence-bearing op (**Claim**, **Identifier**, **Edge**): force **one** confidence for the whole patch (`unverified` / `possible` / `confirmed`). Skip the step if the patch is only Entity / Event / Question (incl. Summary/Notes updates).
- **`confirmed` requires ≥1 Evidence** (file/URL or attestation note) — Job-linked proposal evidence counts and is shown locked (no Add extras / attestation). Only when none are linked: attach Case Evidence and/or create from paste on Accept. `unverified` / `possible` may proceed with zero (warn, don’t block).
- Claim **`class`**: keep as proposed (default `observation`); edit later in Dossier — no bulk class editor on Accept Day-0.
- **Reject:** drop patch; keep already-captured Evidence; reason optional; row stays in history (Rejected filter).
- Any Case member may Accept/Reject Day-0 (dual-control later).
- Agent **graph write** lands on Graph at `unverified` (audited in `graph_writes`). API requires body `userOverride: true`; CLI escape hatch is the verb `wd graph write` (no boolean flag). Dossier-style child writes (`wd claims|identifiers|edges|events|questions …`) need **`--user-override`** and CLI refuses `confirmed` (Triage Accept / Dossier may set it). Later human edits still go through confidence rules.
- **Identifier collision:** if a proposed Identifier `type+value` already exists on another Entity in the Case, Triage shows a warn Alert + per-op chip. Warn, don’t block Accept. Caps stay Case-blind — this is core/Triage, not interpret.
- **Invalid Identifier values:** structured types (`email` / `phone` / `url` / `domain` / `ip` / `pgp`) plus handle→platform are gated by `validateIdentifierWrite`. Triage chips the op and **disables Accept**; core hard-fails the TX. Reject or rewrite the Proposal — no partial Accept.

### Promote-then-adopt (two tracks)

| Track | Rule |
| --- | --- |
| **Visual / shell** | Shared component + Collect + Triage in one change, **or** dated debt row below |
| **Data wiring** | May roll per route (SSE, loaders) independently |

## Empty, error, success (meaning)

| Intent | When | Component |
| --- | --- | --- |
| blank-slate | Never had items | `EmptyState` intent `blank-slate` |
| no-results | Filters hide everything | `EmptyState` intent `no-results` (+ clear) |
| cleared | Queue of remaining work is empty (e.g. pending-only) | `EmptyState` intent `cleared` |
| select-none | Nothing selected in Detail | `DetailEmpty` |
| load failure | Region fetch failed | `FetchErrorAlert` |
| permission | Can’t view route/tile | Empty permission / inline Alert — not a joke empty |

Shell (Page / header / toolbar) stays mounted; only the data region swaps state.

Dossier dedicated tabs (`emptyPresentation="panel"`) use page-level `EmptyState` with a **dashed** panel frame; parents supply flex fill so the blank slate + CTA sit in the remaining page height. Overview nests stay the muted one-liner (`inline`, no dashed frame). Queue columns use `QueueShell` so empty states can vertically center in the pane.

Empty CTAs: real `Button`/`Link`, max one primary. Never `Get Started` / `OK`. Persistent warnings (dual-control, AI-debt) stay **Alert**, not Empty.

## Feedback layers

| Failure | Surface |
| --- | --- |
| Field validation | Input / Field helper (not toast) |
| Transient mutation fail / OK | Sonner toast |
| Region / route load fail | `FetchErrorAlert` in the data region |
| Blocking policy (e.g. dual-control) | Inline Alert — not toast |
| Destructive confirm fail | Inline error inside the dialog (stay open) |

Error copy: user-state `Couldn’t` / `Can’t`; system `Failed to`. Ban `Unable to` / `Oops`. Title names the resource (`Couldn’t load jobs`).

## Destructive actions

| Stakes | Confirm |
| --- | --- |
| Irreversible delete / revoke / wipe | `DestructiveConfirmDialog` (type-to-confirm) |
| Medium (e.g. Intake Hide) | Plain `AlertDialog` |
| Routine cancel / discard | No type-gate |

Dialog titles = Title Case statements (`Delete case`), not questions. Primary = `Verb + Noun` matching title. Destructive menu items last + separated. Never bury delete behind a SplitButton chevron.

## Copy & controls

- Labels: Title Case nouns
- Placeholders: examples, not instructions (`example.com`, not `Enter your domain`)
- Field errors: name the field + period (no “please”)
- Menu / dialog primary: `Verb + Noun`
- Select ≤~10 fixed options; Combobox when filtering helps
- ToggleGroup for 2–3 view modes (not boolean `Switch`) — ButtonGroup vs flex: see [`apps/web/docs/UI.md`](../apps/web/docs/UI.md)
- Tabs for sibling views (prefer URL sync); disabled control → Tooltip explaining why

## Experience debt (dated)

| Item | Status | Notes |
| --- | --- | --- |
| Stub / lying Cap honesty (Process) | done | Deterministic Process Cap harvests → Triage; copy updated |
| Jobs long-run progress | later | Investigator shouldn’t need chat status pastes; Phase 1–2 |
| Async Case catch-up for non-builders | done | `/cases/$caseSlug` Case Overview dashboard; Entities / Identifiers / Graph / Tasks are sibling Active-Case routes |
| Dossier Overview BLOT heaviness | later | Notes split out; Overview still stacks Claims/Ids/Connections — lighten further if needed |
| Dossier Connections ego-graph | done | Compact list + read-only 1-hop canvas; dialog CRUD. Graph Studio Cap-context / full canvas still Phase 2 |
| Form library single stack | done | TanStack Form for composers/dialogs with Save + multi-field or cross-field rules; commit-on-blur cells, blur-autosave prose, SearchField/filter chrome, and DestructiveConfirmDialog stay local state — see `apps/web/docs/UI.md` § Form library |
| Dossier section CRUD duplication | partial | Shared `useInvalidateEntity` + confidence / phrase pickers; composers still per-section |
| Facet checkbox rows extract | later | Optional UX chrome share across toolbars |
| Capability picker discoverability | shipped | CapMatch paste-to-run + category (`id` seg1) + Passive/Active/Footprint filters; empty-default Cap select; Cap meta shows intent |
| Hide restore / honest copy | done | Filters → Hidden + Restore; dialog copy names the path |
| Suppression / cache explainability | done | Collect runs: From cache / N suppressed chips + clearer no-Proposal copy; Triage: Reject FP memory note + suppressed-upstream badge |
| `agent` badge (`proposal.agentSourced`) | done | Shows when Proposal came from agent propose API; override badge removed (audit is `graph_writes`, not Proposal) |
| Playbook credential pre-check in UI | done | Vault `configured` folded into Collect Cap/Playbook `canRun`; `startJob` fail-closed |
| Collect explicit “Run url-capture” | later | Collect toolbar ships first; Playbooks must stay user-initiated (never auto-fire) |
| Figma bridge | later | Gated on Dev seat |
| Deeper search (FTS / cross-Case Graph) | later | Day-0 is Active Case `ilike` via Mod+K; upgrade when it hurts |

UI/engineering debt (tokens, atom extract, `variant="panel"` rename) lives in git history / PRs — not here unless it changes investigator-facing behavior.

## Surface scorecard

| Surface | Feel | Notes |
| --- | --- | --- |
| Collect | Strong | Dump + Cap/Playbook run modes; CapMatch paste-to-run + filters + empty-default Cap select; vault credential presence gates Run; queue clusters playbook steps by run; waiting chrome for the next recipe step; Cancel run; interpretError amber; From cache / suppressed chips; Evidence detail: Enrich Output → Harvest / Extract (AI) → Triage; Hide → Hidden filter → Restore |
| Triage | Strong | Accept/Reject parity with Collect run chrome; Reject explains FP memory; identifier collision Alert (warn, don’t block) |
| Dossier | Mixed | PageHeader trail folder + `{name} / Entities / {name}` (kind badge + editable last crumb); line tabs (`below=`); **Edit** → `DossierEditDialog` (name/kind/summary/notes); **Tasks** tab (entity-scoped kanban, split density); Connections = outbound/inbound list + read-only 1-hop canvas + dialog CRUD (`clampEdgePhrase` on peer change); Evidence tab dumps File/Paste/URL (Entity locked) + list + Drawer peek; `EvidencePicker` on composers / `EvidenceCiteChips` on Job cites; Overview BLOT still dense |
| Entities / Cases | Fine | Entities: dense DataTable (+ Connections). Identifiers: Active-Case table (`/identifiers`) with in-place create + bulk-add paste/map. Graph: `/graph` preview. Cases (Manage): create / Select / Open / export. Case Overview: dashboard only (no Tasks tab). |
| Tasks | Fine | `/tasks` kanban (dnd-kit); drag changes status **and** within-column order (`position`); lane quick-create; `TaskFormDialog` create/edit; date-only due; Task ≠ Graph write |
| Dashboard | Strong | Trail last crumb **Dashboard**. Stat cards 3×2 (Proposals pending / Tasks overdue / Tasks due soon / Jobs running / Entities / Cases); Triage + Due panels (dashed empty); Activity = vertical resizable panel + `ScrollArea` (cross-case, case filter); sidebar owns Case switch / nav / Mod+K Search; dump stays on Collect |
| Settings | Fine | Sidebar sections (Account / Security / API Keys / Credentials); Cap credentials Connect dialog + vault |
| Command palette | Strong | Mod+K shell palette: Jump to + Active Case search (entities / ids / evidence / tasks / jobs / pending Triage) + Cases switch; `?` Shortcuts; Mod+B sidebar |

## UX PR checklist

1. [ ] One job per surface — first viewport isn’t a dashboard of unrelated widgets (unless it _is_ the dashboard)
2. [ ] Empty / error / success mean the right thing (table above)
3. [ ] Copy matches rules (labels, placeholders, errors, toasts)
4. [ ] Collect ↔ Triage parity for shared triage patterns (or debt row)
5. [ ] No new product jargon that fights [`apps/web/docs/UI.md`](../apps/web/docs/UI.md) layout words in the UI chrome
6. [ ] Destructive / hide actions confirmed appropriately (AlertDialog vs type-to-confirm)
7. [ ] Feedback on the right layer (field / toast / FetchErrorAlert / dialog inline)
