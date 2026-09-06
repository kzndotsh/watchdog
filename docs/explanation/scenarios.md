---
document_created: 2026-07-30T01:30
document_updated: 2026-09-06T12:20
---

# SCENARIOS: Day-0 investigator journeys

**What this is:** walked user scenarios vs code. Status SoT for "does this journey work," not architecture. **Not:** Cap unit tests ([`TESTING.md`](../contributing/testing/index.md)), chrome lexicon ([`docs/reference/web/UI.md`](../../docs/reference/web/UI.md)), product doctrine ([`PRODUCT.md`](product.md)).

Status: `shipped` · `partial` · `missing` · `lying` (doc/UI claim a path that cannot complete).

---

## Verdict

Nouns and Caps shipped ahead of walked journeys. The Collect → Decide → Graph loop **mostly works**. Failures cluster where the UI **pretends** a path exists.

**Healthiest:** Triage Accept gates, Cases, Auth, Export zip, Cap-shaped Collect run form, Harvest/Extract on Collect. **Weakest:** none currently: credential preflight and post-dump Entity attach shipped.

**Tutorial:** [`../tutorials/first-investigation.md`](../tutorials/first-investigation.md) mirrors the core `@journey` e2e path; keep it aligned when Intake/Triage flows change.

Before the next Cap or UI slice: happy path + 2-3 sad paths + done-when → walk → update this file.

---

## Fix first (trust damage order)

1. **Keep this file updated**: scenario debt ≠ polish backlog.

---

## Intake

| Scenario | Status | Pitfall |
| --- | --- | --- |
| Paste dump → Evidence + hash | shipped | No client size cap on paste |
| File upload → Evidence | shipped | Orphan MinIO if confirm fails; also `wd evidence file` (same loop) |
| URL dump → Evidence + Enrich | partial | Enrich is a separate verb (UI + `wd evidence enrich`); no hash on URL row |
| Hide / soft-delete | shipped | Filters → Hidden + Restore on Detail |
| Process Cap from Intake | shipped | Also `wd evidence process` (Harvest glue; dedupes active Jobs) |
| Extract (AI) from Intake | shipped | Needs Case `allowThirdPartyEgress` + AI credential; also `wd evidence process --ai` |
| Attach entity to evidence | shipped | Dump-time picker + Detail EntityCombobox (attach / replace / detach) |
| `?id=` deep link (Collect) | shipped | Selection writes back to search (`replace`); unified id for Evidence rows and Jobs |
| No Case / empty queue | shipped | Blank slate: dump File/Paste/URL first; Cap = one capability, Playbook = curated Cap chain (Run is secondary) |

## Jobs

| Scenario | Status | Pitfall |
| --- | --- | --- |
| Start DNS / WHOIS with host | shipped | A/AAAA → `ip` Identifiers; NS/MX stay in Claim; WHOIS expiry Event if within 90 days |
| Start Media oEmbed with URL | shipped | `web.media.oembed`: `@handle` + url Identifiers when Entity set |
| Start URL Enrich from Jobs | shipped | Form sends `{url}` from Cap schema |
| Start Harvest / Extract from Jobs | shipped | Form sends `{evidenceId}`; `evidence.harvest` / `evidence.extract.ai` listed |
| Missing credential preflight | shipped | Run disabled + `jobs.start` / `wd jobs start` refuse before queue |
| Egress off → aiprocess refused | shipped | Jobs + Intake warn/disable before Run |
| Cancel stays cancelled | shipped | ~2s abort poll |
| Stuck >60s banner | shipped | : |
| interpretError amber | shipped | Amber **Interpret failed** text in job detail strip + copy |
| proposalId → Triage deep link | shipped | : |
| Cache hit visible | shipped | Job detail strip **From cache** plain tag from `jobs.from_cache` |
| Playbooks from UI | shipped | Run Cap / Run Playbook ToggleGroup; host/url/ip/email/hash/handle books; bind + CT fan-out (`host-enumerate`); waiting chrome; Cancel run; egress greys `url-capture-ai` |
| Playbook lazy-release | shipped | Later steps are created when the prior step succeeds |
| Playbook egress / credential gate | shipped | Egress + vault presence both gate Run (API playbook start already fail-closed) |
| Cap picker metadata | shipped | CapDescriptor: kind / flags / egress / consumes / produces / credentials / dataSource; CapMatch paste-to-run + category / Passive/Active/Footprint filters; empty-default Cap select |
| CapMatch paste → Cap select | shipped | Seed input drives CapMatch; filters narrow roster; run seeds queue without page flicker |
| Re-run → no duplicate Proposal | shipped | Suppression + Collect/Triage detail-strip tags + no-Proposal copy when all known |

## Triage

| Scenario | Status | Pitfall |
| --- | --- | --- |
| List / filter Proposals | shipped | First paint pending-only; clear filters shows history |
| `?proposalId=` deep link | shipped | Selection writes back to search (`replace`) |
| Review patch ops | shipped | : |
| Accept unverified / possible / confirmed | shipped | : |
| confirmed + attestation paste | shipped | : |
| confirmed zero evidence blocked | shipped | : |
| Zero-evidence warn | shipped | : |
| Identifier collision warn | shipped | Same `type+value` on another Entity → Alert + chip; Accept still allowed |
| Invalid Identifier value blocks Accept | shipped | Soft-strict `validateIdentifierWrite`; Triage chip + Accept disabled; TX hard-fail; no partial Accept |
| Reject → finding suppressions | shipped | Reject UI explains FP memory; re-runs skip |
| agentSourced tag | shipped | Agent propose API sets flag; plain **agent** tag in Triage detail strip; override badge removed |
| Agent propose API / CLI | shipped | `POST …/proposals` · `wd proposals create` → Triage (`agentSourced` + `createdBy`); suppresses known/rejected |
| Agent graph write API / CLI | shipped | `POST …/graph/write` · `wd graph write` → Graph @ unverified + `graph_writes` (same tx); optional idempotency → `replayed` |
| Child Graph writes CLI | shipped | `wd` claims / identifiers / edges / events / questions … need `--user-override`; CLI refuses `confirmed` (Accept may set it) |
| Multi-op partial Accept | missing | All-or-nothing transaction |

## Dossier

| Scenario | Status | Pitfall |
| --- | --- | --- |
| View all sections | shipped | : |
| Edit summary / notes | shipped | : |
| Create claim + confidence + evidence | shipped | `isConfirmedBlocked` disables Save when confirmed with zero evidence |
| Edit claim confidence | shipped | : |
| Edit claim class later | shipped | ClaimClassSelect on Dossier edit |
| Create identifier | shipped | : |
| Bulk add identifiers | shipped | Paste → left/right column match (type from header/values; Email+Phone on one row explodes). Preview cells editable (Entity locked). Handle needs platform. `confirmed` → `unverified`. |
| Identifier confirmed + evidence | shipped | Create + Evidence column picker; confirmed blocked without links |
| Attach / replace identifier evidence | shipped | `EvidencePicker` on create + edit |
| related_to requires notes | shipped | Connection dialog + table composer gate Save when notes empty |
| Connections list + 1-hop ego canvas | shipped | `connections-section`: Outbound/Inbound list + `@xyflow/react` canvas; dialog CRUD; Graph Studio `/graph` still Phase 2 |
| Connection phrase picker (inverse labels) | shipped | `{predicate, orientation}` → absolute `fromId`/`toId`; kind pairs filtered by `validKinds`; Combobox grouped by `EDGE_PREDICATE_GROUPS` |
| Entities table Connections column | shipped | Chips (≤2 + `+N` browse) + Add/edit popover; `preferredEdgePhrase` / `clampEdgePhrase`; writes via `edge-write` builders @ `unverified` (no evidence); row-click opens dossier (chips/Add are buttons) |
| Retract / contest / disprove | shipped | Contest hides like retract |
| Soft-deleted evidence not linkable | shipped | Old links may still display |
| Create entity → dossier | shipped | Person kind seeds default Questions (`seedDefaultQuestions`) |
| Add / edit / resolve / reopen Questions | shipped | Dossier textarea composer; click text or row menu to edit; check or menu to resolve; reopen clears note. Caps still create-only. Also `wd questions update` / `reopen` |
| Dossier Evidence dump | shipped | Evidence tab File/Paste/URL (Entity locked). Same intake APIs; rows also appear in Collect. Process / Enrich / Hide stay on Collect Evidence detail. Preview Drawer on row click. |

## Cases · Dashboard · Settings · Export · Auth

| Scenario | Status | Pitfall |
| --- | --- | --- |
| Cases CRUD + switch cookie | shipped | Org-scoped list/get/create/update/delete (active Better Auth organization). **Open** sets Active + opens Overview; **Set as active case** in card ⋯; New Case dialog (slug auto from name); name/description/egress edit on overview settings (name regenerates slug + Overview URL); slug collision conflicts on create and rename (slug unique is still global); update/egress also via API/CLI |
| Delete case | shipped | Type-to-confirm (`DestructiveConfirmDialog`) on Cases card ⋯ and Overview; cascades Graph/Jobs/Triage/Evidence; heals Active cookie; also `wd cases delete` |
| Case overview page | shipped | `/cases/$caseSlug`: case dashboard (stats / activity / settings); landing via **Open** from Manage Cases; UUID/`?tab=` redirect to slug or `/entities` `/identifiers` `/graph` `/tasks` |
| Identifiers table | shipped | `/identifiers`: Active-Case browse + inline edit + evidence + in-place create (Value first after Entity); **Bulk add** paste/map dialog (default Entity fills empty Entity cells; mapped name/slug miss → **Not found** / **Ambiguous**; preview cells editable; `confirmed` → `unverified`); row click → Dossier Identifiers |
| Bulk add identifiers | shipped | Same two-stage dialog on `/identifiers` and Dossier Identifiers (paste, then left/right match). Default Entity fills empty Entity cells; a mapped name/slug miss shows **Not found** / **Ambiguous** on the Entity cell (picker stays empty). Preview cells are editable (empty Type/Platform = **: **). Dossier locks Entity. Type deferred from column/values. `validateIdentifierWrite` (incl. handle→platform) marks rows invalid. No Evidence / no `confirmed` from paste. |
| Case graph page | shipped | `/graph`: case-wide preview (`CaseGraphCanvas`); Graph Studio still Phase 2 |
| Tasks CRUD + kanban | shipped | `/tasks` kanban only; drag across columns changes status; drag within a column persists `position` via `reorderTasks`; optional entity link (`?entityId=`); card ⋯ / right-click Open + Delete; Dossier Tasks = entity-scoped board; Case Overview has no Tasks tab (stat tile → `/tasks`); not a Graph write |
| allowThirdPartyEgress toggle | shipped | Case overview settings; also `PATCH /cases/{id}` / `wd cases update --allow-third-party-egress` |
| Case-wide identifiers / edges reads | shipped | `GET /cases/{caseId}/identifiers`, `GET /cases/{caseId}/edges` (aggregate views; invalidate with entity change; no CLI parity in v1) |
| Entity rename (display name) | shipped | Dossier last-crumb blur-save (`KindBadge` + `EditableTextCell`); `PATCH …/entities/{entityId}` name; slug unchanged |
| Dashboard stats + Triage / Due panels | shipped | Active-case scoped stats + lists; Activity without `caseId` is org-scoped (not all installs); optional case filter still ANDed |
| Dashboard Activity resize / scroll | shipped | Vertical resizable panel + `ScrollArea`; overview scrolls independently |
| Quick Launch paste → Collect | removed | Dump stays on Collect; Dashboard does not host paste |
| Dashboard → Triage with proposalId | shipped | Triage panel rows deep-link `search.proposalId` |
| Dashboard → Collect with jobId | removed | Jobs running tile links `/collect` without a selected job |
| Settings tab URL sync | shipped | Sidebar tab changes write `?tab=` with `replace: true` (account omits param); deep links `/settings?tab=team | users | …` restore section on load |
| Settings vault credentials | shipped | `/settings?tab=credentials`; Connect/Update dialog; needs `WD_MASTER_VAULT_KEY`; also `wd credentials` / `PUT /credentials/{name}` (never plaintext) |
| Settings Team invite / accept | shipped | `/settings?tab=team`; owner/admin invite `admin` or `member`; copy-link + optional SMTP; accept at `/auth/accept-invitation/{id}` (invite-only register; public sign-up stays gated) |
| Settings Users (instance admin) | shipped | `/settings?tab=users` (hidden unless `auth.user.role` is `admin`); Disable/Enable + sign out all sessions; no impersonation; direct `?tab=users` for others is denied copy |
| Export zip from Cases UI | shipped | Session or API key. Zip 404 if Case missing / out of org or zero entities; entity `export.md` 404 if Case/slug missing or foreign-org `caseId`. Also `wd export zip` / `md` |
| Evidence hide / restore / download | shipped | UI + `wd evidence hide` / `restore` / `download` |
| Evidence process / enrich | shipped | UI + `wd evidence process` / `--ai` / `enrich` (same core glue as Collect) |
| Auth login / gated signup | shipped | `/auth/$path` layout shows WATCHDOG mark + “Case Graph under human custody”; sign-in/up password visibility toggle; signed-in users redirect home from sign-in/up. When `BETTER_AUTH_ALLOW_SIGNUP` is off, sign-in hides the sign-up link and `/auth/sign-up` redirects to sign-in (`GET /api/signup-allowed` is the public flag for that chrome). Invitees register on `/auth/accept-invitation/{id}` without opening public sign-up |

## Search · Hotkeys

| Scenario | Status | Pitfall |
| --- | --- | --- |
| Mod+K opens command palette | shipped | Toggle; works in editable fields; sidebar Search… trigger |
| Jump to pages (idle) | shipped | Dashboard + Case nav + Work/Manage/Config (no Dev /ui) |
| Commands group (idle) | shipped | `SearchUi` `paletteCommands` (Toggle sidebar, Shortcuts); open-palette omitted by construction |
| Type entity name → dossier | shipped | ≥2 chars; Active Case only; Enter → `/entities/$slug` |
| Identifier / Evidence / Task / Job / Triage hits | shipped | Deep links: identifiers tab, `?id=` (Collect Evidence or Job), `?entityId=` (Tasks), `?proposalId=` (Triage) |
| Cases group switches Active | shipped | Sets cookie + opens Overview |
| `?` Shortcuts sheet | shipped | Global list only (no per-surface matrices); HOTKEYS catalog stays static |
| Mod+B toggles sidebar | shipped | Via `useGlobalHotkeys` in `SearchChrome` (not shadcn-only listener) |
| Entities/Identifiers row context menu | shipped | Same labels as ⋯; target-only; editables keep native menu; Dossier Identifiers included |
| Ego graph node menu | shipped | ContextMenu + ⋯ DropdownMenu from `getNodeActions`; Case overview graph omits |
| Dossier section row menus | shipped | Connections / Claims / Events / Questions: `AppAction` factories + ContextMenu + ⋯ |
| Cases card menu | shipped | Open / Set as active / Delete via `caseCardActions` (⋯ + right-click) |
| Task card menu | shipped | Open + Delete via `taskCardActions` (⋯ + right-click); dialog Delete still works |

---

## Doc lies (quick index)

| Claim                    | Reality                    |
| ------------------------ | -------------------------- |
| _(none currently known)_ | Re-check after UI copy PRs |

---

## Scenario card template (for new work)

```md
### <name>

Happy: 1. … 2. … Sad: cancel | missing key | empty result | confirmed no evidence | … Done-when: observable outcome (Job status, Proposal count, Accept blocked, …) Walked: YYYY-MM-DD · pass | fail
```
