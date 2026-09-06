# Components: hand-owned atom registry

This registry documents the hand-owned `src/shared/ui/` atoms, not `shadcn/`. Page chrome (`PageToolbar`, `PageFilterMenu`, `RoutePending`, `RouteError`) is in `shared/layout/`; see the section below. Domain composites such as `EvidencePicker` can appear with status **domain**, but are not in `wd-ui-files.mjs`. It does not cover the brand brief ([`tokens.md`](ui/tokens.md)), product IA (`docs/explanation/ux.md`), or Storybook.

The code source of truth is `src/shared/ui/`. Style guide: **`/ui`** (Foundations · Atoms). Gates: `pnpm ds:check`. Manifest: `scripts/wd-ui-files.mjs`. New atoms: `node scripts/new-atom-checklist.mjs`.

**A new atom is complete when** it has a registry row, a `/ui` specimen, semantic-class tokens, no I/O, a justified second call site, and a passing checklist.

---

## Registry

| Atom | Purpose | Use when | Do not use when | Alternative | Status | `/ui` | Tokens |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ActiveTabBody` | Inactive → null; pending → `PendingRegion` + `stackPendingFallback()` (hand `StackBodySkeleton` fallback) | Stack / Detail tab gates (Case · Dossier · Settings) | React `<Activity>` for heavy canvases | `SuspenseTabBody` inside | canonical | yes | : |
| `SuspenseTabBody` | Suspense + `stackPendingFallback()` | Inside `ActiveTabBody` for lazy tab data | Full-page pending | `RoutePending` | canonical | yes | : |
| `ArtifactPreview` | Presentational artifact chrome (+ `ArtifactPreviewSkeleton` loading layout) | Showing named mime body | Fetching artifacts | : | canonical | no | : |
| `CodeBlock` | Shiki highlighted code | Logs / JSON dumps | Editable fields | `JsonView` for trees | canonical | no | : |
| `ClickableIdChip` | Preview `IdChip` (eye glyph) | Click-to-preview evidence ids | Plain / copy chips | `IdChip` | canonical | yes | : |
| `ComposerShell` | Muted bordered composer surface | Add/edit dossier forms | Callouts / dashed rows | : | canonical | yes | muted |
| `ConfidenceSelect` | Confidence Select: CONTROL chrome (same density as FieldSelect) | Graph / Accept confidence | Display-only chips | `ConfidenceBadge` | canonical | yes | : |
| `control-chrome` | Shared dense field + menu tokens (`h-8` / `text-xs` / `rounded-md`) | SearchField · Select · Combobox | Freestyle control heights | : | canonical | no | : |
| `CopyControl` | Copy-to-clipboard control | Standalone copy affordance | Inside opaque ids | `IdChip copyable` | unused | indirect | : |
| `DestructiveConfirmDialog` | Type-to-confirm destroy | Irreversible deletes | Soft cancels | AlertDialog | canonical | no | destructive |
| `DetailEmpty` | Select-none Detail empty: quiet, no dashed frame | No queue selection | Loading / blank slate | `InlineLoading` · `EmptyState` | canonical | yes | muted |
| `DetailFooter` | Bottom CTA bar for Detail | Accept / Cancel / Harvest · Enrich | Identity / meta | `DetailHeader` | canonical | yes | : |
| `DetailHeader` | Detail identity: title · subject · meta · IdChip · status · note | Collect Evidence detail (custom crumb+tabs); Triage uses context strip + decide footer | Page headers · CTAs; Triage → `TriageDecideHeader` + `TriageDecideFooter`; Collect Evidence → `EvidenceDetailHeader`; Collect runs → inline header in `job-detail.tsx` | `DetailFooter` | canonical | yes | : |
| `DetailStatusChip` | Outcome / tag pill: same outline + `CHIP_SIZE_CLASS` as VocabBadge (IdChip height/radius; `text-label-meta`); exports `CHIP_SIZE_CLASS` for skeleton shape parity | Identifier evidence preview · Triage patch-op warnings · table/composer tags | Detail context strips (use plain `span`s + `StatusInk` for lifecycle) | `StatusBadge` · `KindBadge` | canonical | yes | : |
| `ConfidenceBadge` | Confidence chip | Graph confidence display | Job/proposal status | `StatusBadge` | canonical | yes | `--confidence-*` |
| `StatusBadge` | Status chip | Tables / dense cells that still need a boxed label | Detail context strips | `StatusInk` | canonical | yes | `--status-*` |
| `StatusInk` | Status as colored type + 6px dot | Collect / Triage / Jobs Detail strips | Table cells that need a chip | `StatusBadge` · `StatusDot` | canonical | yes | `--status-*` |
| `TaskStatusBadge` | Task status chip (reuses `--status-*` tones) | Task board / compact tabs | Job status | `StatusBadge` | canonical | no | `--status-*` |
| `TaskPriorityBadge` | Task priority chip (reuses `--status-*` tones) | Task board / compact tabs | Confidence | `StatusBadge` | canonical | no | `--status-*` |
| `KindBadge` | Kind chip (+ entity kind icon for person/org/infra) | Evidence / identifier kind chips | Entity name rows (use `EntityKindGlyph`) | `EntityKindGlyph` | canonical | yes | `--kind-*` |
| `EntityKindGlyph` | Entity kind icon + type tooltip | Before entity names (Entities table · Identifiers Entity column · dossier trail) | Evidence/identifier kind chips | `KindBadge` | canonical | no | `--kind-*` |
| `ClaimClassBadge` | Claim-class chip | Claims / disprove | Entity kinds | `KindBadge` | canonical | yes | `--kind-*` |
| `PatchOpBadge` | Patch op chip | Triage patch ops | Job status | : | canonical | yes | `--status-*` |
| `EmptyState` | blank-slate / no-results / cleared: quiet chrome (no built-in dashed frame) | Queue or blank slate; dossier panel parents may add dashed border | Select-none Detail | `DetailEmpty` | canonical | yes | : |
| `EntityNode` | Entity card (kind border + optional ⋯ menu) | Graph canvases (ego + case overview) | Non-graph lists | `EntityMention` | canonical | no | `--kind-*` |
| `GraphEdgePath` | Floating bezier + predicate label | Graph canvases | Tables / lists | : | canonical | no | `--confidence-*` |
| `GraphCanvas` | CSS dot grid + pan/zoom + fit-view; optional `getNodeActions` → ContextMenu + ⋯ | Ego + case overview canvases (case omits `getNodeActions`) | Custom physics / layout | domain layout helpers | canonical | no | : |
| `GraphCanvasSkeleton` | Hand graph skeleton layout | Graph loading region / `/ui` specimen | Primary graph runtime | `GraphCanvas` | canonical | yes | : |
| `EntityMention` | Entity name (optional dossier link) | Inline entity refs (dossier connection list) | Row-click tables / Entities Connections chips (nested `<a>` fights row nav) | static name / chip text | canonical | yes | : |
| `ActorMention` | Optional `By` prefix + AtSign glyph + handle (`api-key:…` unprefixed); no chip | Job / Evidence / Triage / Activity actor | Entity names · opaque ids | `EntityMention` · `IdChip` | canonical | yes | : |
| `EditableSuggestCell` | Commit-on-pick suggest cell (uncontrolled selection: avoids snap-back to the stale saved value) | Inline table freeform+suggest | Forms | `EditableTextCell` · `FieldCombobox` | canonical | no | : |
| `EvidencePicker` | Dense multi-select Case Evidence (chip-height Add/+ · checklist popover; `layout="panel"` for parent shells; options as `readonly EvidenceOption[]`; label helper `evidenceLabel` in `shared/ui/intake/evidence-option.ts`) | Dossier composers · identifier Link · Triage | Job cite display | `EvidenceCiteChips` | **domain** (`dossier/components/evidence-picker.tsx` re-exports `shared/ui`) | no | : |
| `EvidenceCiteChips` | Read-only Job/proposal cite chips | Triage decide band | Multi-select | `EvidencePicker` | **domain** (same file) | no | : |
| `EvidenceDetailSkeleton` | Evidence/Collect Detail skeleton: header · tabs · `ArtifactPreviewSkeleton` · `DetailFooter` | Collect/Triage detail data-slot | Static shell / select-none empty | generic header/body blocks | canonical | no | : |
| `FetchErrorAlert` | Load-failure banner | Route / region fetch fail | Field validation | `FormInlineError` | canonical | yes | destructive |
| `FieldSelect` | Dense string Select: CONTROL chrome | Cap / playbook / kind pickers | Native `<select>` · enum-specific atoms | `ConfidenceSelect` · `FieldCombobox` | canonical | yes | : |
| `FieldCombobox` | Filterable string Combobox: CONTROL chrome; optional `group` → section headings | Long / searchable option lists (edge phrases) | Tiny closed enums | `FieldSelect` · `EntityCombobox` | canonical | no | : |
| `FormInlineError` | Field / form inline error | Mutation / validation errors | Load failures | `FetchErrorAlert` | canonical | yes | destructive |
| `FormInlineWarning` | Field / form inline warning | Soft confirm / evidence hints | Hard errors | `FormInlineError` | canonical | yes | warning |
| `FormSection` | Settings fieldset card (`ACCENT_CARD_SURFACE`) | Auth/settings forms | Queue composers | `ComposerShell` | canonical | no | : |
| `IdChip` | Opaque id/hash mono chip (whole-chip copy when `copyable`; `full` skips truncate) | UUIDs / hashes | Human labels | `MiddleTruncate` · `CopyControl` | canonical | yes | chip |
| `IdentifierNotesCell` / `NotesIconCell` | Sticky-note icon → right Sheet + `RichTextEditor` Markdown (blur/close autosave) | Identifier + Entity table Notes columns (`/identifiers` · `/entities` · Dossier Identifiers) | Inline Notes cells · entity Summary/Notes tabs | `RichTextEditor` | canonical | no | : |
| `InlineLoading` | Spinner + label region wait | In-flight Detail / panel | Full-page pending | `RoutePending` | canonical | yes | : |
| `JsonView` | Collapsible JSON tree | Structured artifacts | Syntax-highlighted dumps | `CodeBlock` | canonical | no | : |
| `LocalDateTime` | Short local datetime (`dateOnly` → calendar day) | Absolute times · task due dates | Relative "3m ago" | `RelativeTime` | canonical | no | : |
| `MetaRow` / `MetaGrid` | Key/value detail rows | Evidence / artifact meta | Form fields | `FormSection` | canonical | no | meta |
| `MiddleTruncate` | Head…tail truncate | Inside chips | General text | CSS truncate | internal | indirect | : |
| `QueueDayGroup` | Day-bucketed queue section; live lists use sticky day headers; **`CollectQueueSkeleton` uses `headerVariant="panel"`** so day bars do not overlap rows in a clipped `QueueShell` | Chronological queues | Flat lists | : | canonical | no | : |
| `QueueFilterBar` | Search + facets + reset | Split Queue filters | Page-level filters only | `PageFilterMenu` (`shared/layout/`) | canonical | no | : |
| `QueueHeader` | Queue column title + count | Split Queue | Page titles | : | canonical | yes | : |
| `QueueShell` | Queue scrollport: sticky header + ScrollArea; body flex-fills so EmptyState can center. `scrollable={false}` swaps `ScrollArea` for a plain `overflow-hidden` clip: use while skeleton rows fill the pane so loading never shows its own scrollbar | Collect / Triage Queue | Nested scroll + outer header | `SplitView` · `ScrollArea` | canonical | no | : |
| `QueueRow` (+ Title/Meta) | Queue hit-target row | Homogeneous work lists | Card stacks | : | canonical | yes | : |
| `RecentActivity` | Dashboard Activity: header + case filter + ScrollArea feed (lives in vertical resizable panel) | Dashboard Activity panel | Page-level dump / paste | `ScrollArea` · `ResizablePanelGroup` | **domain** (`dashboard/components/recent-activity.tsx`) | no | : |
| `RelativeTime` | Relative + tooltip absolute | Queue/activity times | Exact wall clock alone | `LocalDateTime` | canonical | yes | : |
| `RichTextEditor` | Plate Markdown editor (marks · headings · lists); toolbar state helpers in `rich-text-toolbar-controls.lib.ts` | Dossier Summary / Notes · Edit dialog prose | Claim/identifier note fields · Plate JSON persistence | `Textarea` · `RichTextViewer` | canonical | yes | : |
| `RichTextViewer` | Read-only Plate Markdown render | Future Proof / manuscript preview | Editable prose | `RichTextEditor` | canonical | no | : |
| `RowActionsMenu` | Hover-reveal row actions | Dossier row menus · Entities / Identifiers table Actions column · graph node ⋯ · Cases cards | Page toolbars | DropdownMenu | canonical | yes | : |
| `DropdownActionItems` / `ContextActionItems` | `AppAction[]` → menu items | Shared ⋯ / right-click / factories | Ad-hoc `DropdownMenuItem` when a factory exists | : | canonical | yes | : |
| `ActionsContextMenu` | ContextMenu + editable capture skip | Table rows · inset fallback · graph nodes · Cases cards | Dropdown-only ⋯ | ContextMenu | canonical | no | : |
| `TargetActionsHost` | ContextMenu shell + trailing ⋯ for a target `AppAction[]` | Dossier Connections / Claims / Events / Questions rows | Tables (use `getRowActions`) · Cases (manual header ⋯) | `ActionsContextMenu` · `RowActionsMenu` | canonical | no | : |
| `SearchField` | Named search input: CONTROL chrome | Filters / toolbars | Debounced fetch inside atom | : | canonical | yes | : |
| `SectionHeaderBar` | Title + count + trailing | Sections / day groups | Page headers | `Page` header | canonical | no | : |
| `SectionLabel` | Small meta section label (normal case) | Field / meta captions · dossier section titles | Page titles | : | canonical | yes | meta |
| `LoadingRegion` | Three-channel a11y wrapper (`aria-busy` + sr-only `role="status"` + `aria-hidden` skeleton subtree) | Inside `PendingRegion` / hand skeletons | Domains spelling `aria-busy` directly | : | canonical | no | [`loading-region.tsx`](../../../apps/web/src/shared/ui/loading-region.tsx) |
| `RegionBoundary` | `QueryErrorResetBoundary` → `ErrorBoundary` → `Suspense`: error + pending in the same footprint | Every in-page data region (Collect/Triage split, Dashboard panels, …) | Route-level error for region failures | raw `Suspense` alone | canonical | no | [`region-boundary.tsx`](../../../apps/web/src/shared/ui/region-boundary.tsx) |
| `PendingRegion` | `LoadingRegion` + hand skeleton `fallback` when `loading={true}`; live children when ready | Domain data-slot loading (boards, grids, stack, split queue/detail, case overview) | **`DataTable`** (use `pending`) · graph (hand `GraphCanvasLoadingRegion`) · static chrome | hand skeletons in `skeletons.tsx` as `fallback` | canonical | no | [`pending-region.tsx`](../../../apps/web/src/shared/ui/pending-region.tsx) |
| `QueueSkeleton` | Queue-row skeleton | `PendingRegion` fallback · `/ui` specimen | Full page chrome · stack tabs | : | canonical | yes | : |
| `StackBodySkeleton` | Hand stack/tab skeleton | `PendingRegion` / `stackPendingFallback()` fallback · Settings Suspense | Primary stack pending (use `PendingRegion`) | `stackPendingFallback()` | canonical | yes | : |
| `BoardSkeleton` | Task board column/card skeleton | `PendingRegion` fallback for task board | Full page chrome | : | canonical | yes | : |
| `CardGridSkeleton` | Case grid slot skeleton | `PendingRegion` fallback for cases grid | Full page chrome | : | canonical | yes | : |
| `case-card-shell` | Shared case grid card/create shell class tokens | `CaseList` · `CardGridSkeleton` | Ad-hoc case card chrome | : | canonical | no | : |
| `DossierBodySkeleton` | Alias of `StackBodySkeleton` | Legacy import | Prefer `StackBodySkeleton` | : | deprecated | yes | : |
| `SplitView` | Queue \| Detail split | Console surfaces | Stacked pages | : | canonical | yes | : |
| `StatusDot` | Lifecycle color dot | Live job rows | Full status label | `StatusBadge` | canonical | yes | `--status-*` |
| `TabCount` | Count pill on tabs / last crumb | Tab labels · `PageHeader count=` | Queue headers · `/ N entities` copy | `QueueHeader` count | canonical | no | : |
| `task-board-shell` | Shared task column/card shell class tokens | `TaskBoardColumn` · `TaskCard` · `BoardSkeleton` | Ad-hoc card chrome | : | canonical | no | : |
| `TimelineSpine` / `TimelineDot` | Vertical timeline rail | Events / questions | Flat lists | : | canonical | yes | : |
| `Timestamp` / `WithTooltip` | Instant + tooltip wrapper | Time surfaces / dense hits | Bare titles | : | canonical | yes | : |
| `CapabilityLabel` | Cap id → catalog title | Collect / Triage / Dashboard | Raw ids in UI | : | canonical | no | : |
| `DataTable` (+ kit) | TanStack table shell (dense: `text-xs` · `th` h-8 · `td` py-1 · row h-10). `table-fixed` + `<colgroup>` from each column's `size`: set `size` on every column ([`tables.md`](ui/tables.md#table-columns)). **`pending`** + **`pendingLabel`** → one skeleton bar per cell under the mounted header: **never** `PendingRegion` ([`tables.md`](ui/tables.md)). Kit internals: `use-data-table.ts`, `table-features.ts` (static TanStack v9 `tableFeatures` bundle) | Entity / identifier tables (Entities: `entity-table.columns.tsx` + `hooks/use-entity-table.ts`; Identifiers: `identifiers-table.columns.tsx` + `hooks/use-identifiers-table.ts`; evidence cell: `shared/ui/identifiers/identifier-evidence-cell.tsx`; notes cell: `shared/ui/identifiers/identifier-notes-cell.tsx`). Bulk-add preview is a raw `Table` + `PREVIEW_COLUMNS` colgroup, not this kit. Dossier Identifiers uses Suspense (no `pending`). | Queue lists · Cases card grid · Task board | `QueueRow` | canonical | **no** | : |
| `EditableTextCell` | Commit-on-blur text cell | Inline table edit | Forms | `Input` | canonical | no | : |
| `EditableSelectCell` | Commit-on-pick select cell | Inline table enum edit | Forms | `Select` | canonical | no | : |
| `DataTableAddRow` / `TableComposerInput` | Dashed append-row create chrome | Entity / identifier tables | Page composers · Cases New Case dialog | `ComposerShell` | canonical | no | : |
| `vocab/*` | Exhaustive label+tone maps | All enum display | Schemas package | : | canonical | via badges | domain |

### Page chrome (`shared/layout/`: not in `wd-ui-files.mjs`)

| Piece | Purpose | Use when | Do not use when | Alternative |
| --- | --- | --- | --- | --- |
| `PageHeader` / `AppBreadcrumbs` | Sticky inset bar; trail is identity (`page-trail.ts`); `count=` + `countOn=` = `TabCount` | Every inset page | Second AppShell header; Detail slash-paths; `/ N entities` copy | Detail headers keep their own crumbs |
| `PageToolbar` | leading/center/trailing strip under `PageHeader` | Page / queue toolbars | Detail headers | `DetailHeader` |
| `PageFilterMenu` / `PageFilterChip` | Filter popover + chips | Queue / table toolbars | Search alone | `SearchField` |
| `RoutePending` | Shared `pendingComponent` (`queue` \| `stack`) with `PendingRegion`; trail still paints | `defaultPendingComponent` floor · future `ssr:false` routes (`// ds:allow-route-pending`) | Shell-first data pages (Collect, tables, …): in-page `RegionBoundary` / `PendingRegion` instead | `DefaultRoutePendingShell` (`RoutePendingSkeletonLayout`) · `stackPendingFallback()` |
| `RouteError` | Shared `defaultErrorComponent` + per-route override; **Retry** via `router.invalidate()` | Route / layout errors | Inline field errors | `FetchErrorAlert` in `RegionBoundary` |

---

## Vocabulary layer

Canonical unions: [`packages/schemas/src/vocab.ts`](../../../packages/schemas/src/vocab.ts) · patch: [`patch.ts`](../../../packages/schemas/src/patch.ts).

**Label ownership:** display labels live in `apps/web/src/shared/ui/vocab/`. `packages/schemas` stays free of UI. CLI emits raw enums.

| Union | Display | Notes |
| --- | --- | --- |
| `ConfidenceTier` | `ConfidenceBadge` + `CONFIDENCE_*` | No `probable` |
| `JobStatus` / `ProposalStatus` / `RetractKind` / `IdentifierStatus` | `StatusBadge` / `StatusDot` | Shared `DisplayStatus` |
| `TaskStatus` / `TaskPriority` | `TaskStatusBadge` / `TaskPriorityBadge` | Tone-map onto existing `--status-*` |
| `EntityKind` / `EvidenceKind` / `IdentifierType` / `ClaimClass` | `KindBadge` / `ClaimClassBadge` | Schema-typed only; entity kinds include icon in badge |
| `EdgePredicate` | `predicateLabel` / `edgePhraseOptions` (+ `group`); `preferredEdgePhrase` / `clampEdgePhrase` | Exhaustive Record; inverses = display only (`inverseLabel`); Combobox groups from schema `EDGE_PREDICATE_GROUPS` |
| `PatchOp` | `PatchOpBadge` + `PATCH_RESOURCE_META` | Domain tones |
| Capability id | `CapabilityLabel` / `capabilityLabel` | Catalog title |

Fictional tokens (`probable`, `active`/`dormant`/`merged`, vault kinds, `--severity-*`) purged from types + CSS.

---

## Lifecycle contract (aligned)

| Rule | Implementation |
| --- | --- |
| Static shell never skeleton | Domain owns `<Page>` + `PageHeader`; data slot = `RegionBoundary` + `PendingRegion` / hand fallback (`QueueSkeleton`, `BoardSkeleton`, …) or **`DataTable` `pending`** for tables: see [`loading.md`](ui/loading.md) · [`tables.md`](ui/tables.md) |
| Detail fetch wait | `InlineLoading` on buttons / artifact panels: never `DetailEmpty` for fetch |
| Stack tab / panel first load | Generic stack: `ActiveTabBody` → `stackPendingFallback()`. Dossier tabs: hand `LoadingRegion` + `*SkeletonLayout` except tasks (`BoardSkeleton`); Case Overview → `CaseOverviewPending`: never "Loading…" copy in data slots |
| Dashboard live data | `useLiveEvents` on Dashboard for jobs + proposals + tasks |
| Mutation errors | Prefer `FormInlineError` **or** toast: not both (Entities Connections popover: inline; success may still toast) |
| Load failures | `FetchErrorAlert` (+ optional `onRetry` in region boundaries; `meta.silentError` when inline) |
| Empties | `EmptyState` / `DetailEmpty`: not raw shadcn `Empty` in domains |

---

## Enforcement

`scripts/ds-ban-check.mjs` enforces:

- Bidirectional `wd-ui-files.mjs` ↔ `shared/ui` (excl. `shadcn/` and `__tests__/`)
- Required `/ui` fixture atoms
- Freestyle palette across all `src/`
- Opaque-id `.slice` across all domains
- Fictional vocab literals
- Loading doctrine bans (RoutePending in routes, shadcn/skeleton in domains, animate-pulse / aria-busy outside shared/ui, loader `Promise.all`, useSuspenseQuery waterfalls): see [`loading.md`](ui/loading.md)
- `COMPONENTS.md` present

Stop hook (`.cursor/hooks/stop-gate.mjs`) lint-checks files changed this turn and runs `ds:ban` when web UI paths are dirty; pre-push owns the full typecheck.

New atoms: `node scripts/new-atom-checklist.mjs <Name> <file>`.
