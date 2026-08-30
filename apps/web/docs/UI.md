# UI — design system

**What this is:** how we _build_ the interface — tokens, atoms, layout chrome, naming of UI parts, engineering gates.  
**What this is not:** product IA, user flows, copy, or experience debt — that is [`docs/UX.md`](../../../docs/UX.md).

Code SoT: `src/styles.css` + `src/shared/ui/` (hand-owned) + `src/shared/ui/shadcn/` (registry). Style guide / library: **`/ui`** (Foundations · Atoms) — not Storybook.

`src/auth/ui/` is vendored [Better Auth UI](https://better-auth-ui.com/) held at upstream style — excluded from oxlint/oxfmt/desloppify like `shared/ui/shadcn/`; patch minimally and prefer shared `@/lib/utils` helpers when touching error handling.

## Delivery

Greenfield Foundations/atoms on `/ui` **before** inventing chrome inside live product pages. `shared/ui` = presentational only (**no I/O**). Domains wire data via hooks/serverFns. Extract named generics at the **second** call site.

| Gate                      | Command                                      |
| ------------------------- | -------------------------------------------- |
| Typecheck + DS bans       | `pnpm --filter @watchdog/web ds:check`       |
| Hand-owned atom checklist | `scripts/wd-ui-files.mjs`                    |
| After `shadcn add`        | `pnpm --filter @watchdog/web shadcn:nocheck` |

## Chrome lexicon (UI parts)

Name the **layout kind**, then the **parts**. These are component/layout words — not product feature names.

| Kind | Parts | Layout atom |
| --- | --- | --- |
| **split** | **Queue** (list) + **Detail** (selection) | `SplitView`, `density="split"` |
| **stack** | **Section** × N | — |
| **table** | data table | Entities / Identifiers; bulk-add preview |
| **form** | **FormSection** × N | — |
| **card grid** | searchable cards (+ dashed create CTA) | Cases — `ACCENT_CARD_SURFACE` |
| **board** | status columns + cards (kanban) | `/tasks` + Dossier Tasks tab — domain-owned (`TaskBoard`) |
| **mixed (dashboard)** | Stat cards + section panels + resizable Activity (`ScrollArea`) | `/` Dashboard — domain-owned (`MetricsSection`, `dashboard-panels`, `RecentActivity` in vertical `ResizablePanelGroup`) |

| Part | Code |
| --- | --- |
| **Page** | `<Page>`, `PageHeader` (trail / `AppBreadcrumbs`), `PageToolbar` |
| **Queue** | `QueueRow`, `QueueHeader`, `QueueFilterBar`, `{Domain}QueueList` |
| **Detail** | `{Domain}Detail`, `DetailHeader`, `DetailFooter`, `DetailEmpty` |
| **Section** | `DossierSection`, `FormSection`, … |
| **Drawer** / **Dialog** | overlay primitives + domain wrappers |
| **Toolbar** | `PageToolbar`, `{Domain}QueueToolbar` |

**Bar** only in compounds (`QueueFilterBar`, `SectionHeaderBar`).

**Banned as UI surface names:** Console · Workbench · Tape · Panel · Pane · Rail · Strip.  
Vendor exception: `react-resizable-panels` / `data-slot="resizable-panel*"`.

```
SplitView → Queue | Detail
Never: *Console *Workbench *Panel *Pane *Rail *Strip *Tape
```

```
┌─ Page ───────────────────────────────┐
│ PageHeader / PageToolbar             │
├──────────────┬───────────────────────┤
│ Queue        │ Detail                │
│  QueueHeader │  DetailHeader / Collect crumb+tabs │
│  QueueRow…   │  body                 │
│              │  DetailFooter (CTAs)  │
└──────────────┴───────────────────────┘
```

## Design system

- Primitives: shadcn (Base UI / `base-nova`) in `src/shared/ui/shadcn/` (registry / `@ts-nocheck`)
- Hand-owned atoms: `src/shared/ui/` (`QueueRow`, `SplitView`, data-table kit, …)
- Page chrome: `shared/layout/{app-shell,app-sidebar,app-breadcrumbs,page,page-trail,use-page-trail,page-toolbar,page-filter-menu,route-pending,route-error,case-switcher,theme-toggle}`
- Prefer `@/shared/ui/*` (owned) / `@/shared/ui/shadcn/*` (primitives) over raw HTML
- Theme: OKLCH cool neutrals (~250) + **steel-cyan** accent (~220) + **amber** signal (~75); **no violet brand**
- Font (Fontsource, self-hosted — not Vercel `geist` / Next `next/font`):
  - Sans: **Geist Variable** → `--font-sans` via `@fontsource-variable/geist/wght.css`
  - Mono: **Geist Mono Variable** → `--font-mono` via `@fontsource-variable/geist-mono/wght.css`
  - Family names must match the package `@font-face` strings exactly (`"Geist Variable"` / `"Geist Mono Variable"`).
  - Radius ladder (only three + exceptions):
    - **`--radius: 0.5rem`** = medium base (**8px**) — default via `rounded-md`
    - `rounded-sm` (4px) — checkbox / tiny inset
    - `rounded-md` (8px) — controls, chips, dense panels
    - `rounded-lg` (12px) — cards, dialogs, menus, larger surfaces
    - Exceptions: `rounded-full` · `rounded-none` · `rounded-[inherit]`
    - Ban `rounded-xl` / `2xl` / `3xl` / `4xl` and arbitrary `rounded-[min(…)]` / `calc(var(--radius)±Npx)`
- Mode: **Operate** (consistency over surprise)
- Theme toggle: `.dark` / `.light` on `<html>`; Sonner follows that class
- Root: `TooltipProvider delay={500}` + `Toaster` (dense hit targets: `WithTooltip` + `wrapSpan`)
- Tooltip chrome: elevated dark tip (`--wd-neutral-800` / `--wd-neutral-50` + light ring) via `TooltipContent` — sits above dark page bg; `Timestamp` / `WithTooltip` / sidebar share it
- shadcn folder excluded from typecheck; hand-owned `shared/ui` typechecked by default
- Base UI: `Button` + `render={<Link … />}` → **`nativeButton={false}`**
- **no-I/O litmus:** `shared/ui` never fetches, mutates, or routes. Domains own I/O.
- Homogeneous work lists → `divide-y` Queue rows (not Card-per-row stacks). Cases are a small set of containers — card grid is OK (`ACCENT_CARD_SURFACE`).
- Never name a UI component `Entity` — that word means graph subject; use `QueueRow` / `DossierEditDialog` / domain-prefixed names.

## Table columns

`DataTable` is `table-layout: fixed` + `width: 100%` + a `<colgroup>` from TanStack `column.size` (percent of the sum). CSS leftover space goes to columns with no width, or is spread across all columns when widths don’t fill the table — do not pin some `th`/`td` with `w-*` and leave others open.

| Do | Don’t |
| --- | --- |
| Set `size` (and `minSize` on enums) on every column | Rely on TanStack’s default 150 — equal leftover, no hierarchy |
| Size enums to the longest label + cell chrome (~140 for Status / “In Progress” / “unverified”) | `w-24` on a select cell |
| Give leftover to the fluid text column via a larger `size` (Title / Value / Name) | Unconstrained first/last column |
| `min-w-0 overflow-hidden` on cells; truncate in the cell | Let `min-width: auto` fight the colgroup |
| Raw preview tables: same `<colgroup>` percentages that sum to 100% | Widths only on `<th>` |

Surfaces: Entities (`entity-table.columns.tsx`), Identifiers (`identifiers-table.columns.tsx` + dossier `identifiers-section.cells.tsx`), bulk-add preview (`PREVIEW_COLUMNS` in the dialog). Queues / boards / ColumnMapper grids are not tables. **Loading** on Entities / Identifiers: `DataTable` `pending` — per-cell skeletons under this colgroup ([§ Tables](#tables)).

## Color tokens

Bind to **semantic** tokens only. `--wd-*` ramps define those semantics.

| Job | Prefer |
| --- | --- |
| Page | `background` / `foreground` |
| Elevated | `card` |
| Overlay | `popover` |
| App nav chrome | `sidebar-*` (don’t invent a third panel palette) |
| Action | `primary` |
| Hover/selected | `accent` |
| Helper | `muted` / `muted-foreground` |
| Danger | `destructive` |
| Resting stroke | `border` / `input` (quiet mix — same as field Select chrome) |
| Triage selection | `signal` |
| OK | `success` |
| Caution | `warning` |

Domain meaning: `--confidence-*` / `--status-*` / `--severity-*` / `--kind-*` only. Never freestyle `text-green-600` / `text-amber-400` for those meanings. Badges are **meaning-named** (`ConfidenceBadge`), never color-named (`variant="purple"`).

Contrast fix: adjust OKLCH **L only** — keep hue/chroma stable.

## Refuse list (AI slop)

No nested cards, colored side-tab accents, glow/halo, gradient text, icon-tile feature grids, bounce/elastic easing, decorative glass, mono-as-decoration, cream/violet brand defaults.

## Type roles

`text-heading-page|dossier|section`, `text-label` / `text-label-sm` / `text-label-meta` / `text-label-meta-sm`, `text-label-mono` / `text-label-mono-sm` (Geist Mono via `--font-mono`), `text-copy` / `text-copy-sm`, `text-chip` (uppercase chips only). Ban new `text-[10px]` / `text-[11px]` outside `styles.css`. Mono = IDs/hashes/paths/capability ids. Register new roles in `lib/utils.ts` for twMerge.

## Page shell

- `<Page>`: `px-3 pb-3 pt-0 gap-4`; `density="split"` | `"default"`
- `<PageHeader>`: sole inset top chrome; always rendered; always mounts the route + Active-Case **trail** (`AppBreadcrumbs`). Optional **`actions=`**, **`current=`** last-crumb override, **`count=`** + **`countOn=`** (`TabCount` on the last crumb; hide at 0 and when the trail has already left that crumb — pending previous page must not keep its pill), **`below=`** line tabs. Do not pass identity titles or explainer `description=` copy (404 pages may use `description=` for the missing slug). Layout chrome lives in `shared/layout/` (not a COMPONENTS atom). Do not add a second AppShell header.
- Theme toggle lives in sidebar user menu
- Measurements: PageHeader trail row `h-10` (+ optional `below` line tabs `h-8`); QueueHeader + split detail `DetailContextHeader` both `h-10` / `border-b` / `px-3` (aligned across columns); Queue row `px-3 py-1.5` / title `text-xs`; **Collect split detail** = `DetailContextHeader` + line tabs `h-8`; **Triage split detail** = `DetailContextHeader` (Entity · name · From cap · status) + flat Changes ledger + decide footer; **stack pages** (Dossier + Case overview) use PageHeader `below=` line tabs (text + `TabCount`; no tab icons); DetailFooter `px-4 py-2` (CTAs); SplitView default list **`34%`** (min `22%` / max `55%`)
- **Split-view ownership:** route owns `<Page density="split">`; domain owns `PageHeader`, queue toolbar, and `SplitView` regions. Domain must not wrap a second `<Page>`.
- **Table/board ownership:** domain owns `<Page>` + `PageHeader` (Entities, Tasks).
- **Stack ownership:** domain owns full `<Page>` shell (Dossier, Case overview, Cases list). **Dashboard** also owns the shell but uses `density="split"` + vertical resizable overview ↔ Activity. Settings is the exception — route owns `<Page>` + `PageHeader`; domain owns `SettingsShell` body only.
- Panel empties (`emptyPresentation="panel"`) pass dashed-frame classes into `EmptyState`; Overview inline empties stay muted text.
- **Shared graph chrome:** `shared/ui/graph/` hosts `GraphCanvas` (CSS dot grid + pan/zoom + fit-view) plus `EntityNode` / `GraphEdgePath` / floating-edge math / kind+confidence stroke helpers. Ego 1-hop layout stays in `dossier/.../ego-graph/`; case-wide force layout lives in `cases/.../case-graph/`.
- **Trail = identity:** last crumb is the current page (`aria-current="page"`); ancestors are links. A Case crumb is a folder icon + `{name}` (no `Case:` prefix; `aria-label` still `Case {name}`). When Case is the first crumb it links to Overview (`/cases/$activeSlug`). On Overview the last crumb is folder + name; ancestor `Cases` → `/cases`. Work surfaces are `{folder} {name} / Collect` or `/ Triage` (etc.). Dossier is `{folder} {name} / Entities / {name}` — last crumb = `KindBadge` + `EditableTextCell` via `current=` (same rename commit). No Active Case → omit the Case crumb. Do not lift Collect/Triage Detail `?id=` / `?proposalId=` slash-paths into PageHeader. Matcher: `shared/layout/page-trail.ts` (pure). Hook: `use-page-trail.ts` (`useQuery(casesContextQuery())`, not suspense; optional `entityBySlugQuery` on dossier). **Edit** still opens `DossierEditDialog` for name / kind / summary / notes. Case rename stays on Overview settings (`CaseSettingsForm`) — name blur-save regenerates slug and replace-navigates `/cases/{slug}`. Notes + Tasks tabs use `density="split"` so the body fills.
- **`SectionLabel`:** normal case (`text-label-meta`); do not force uppercase — `text-chip` stays for uppercase chips only.

## Form library

**Stack:** `@tanstack/react-form` only. Do not add `react-hook-form`.

| Use TanStack Form | Leave as local state |
| --- | --- |
| Composer / dialog with discrete Save/Submit | Single-value commit-on-blur/Enter (`EditableTextCell` / `EditableSelectCell` — incl. dossier last-crumb rename) |
| 2+ fields, or a cross-field rule (e.g. confirmed↔evidence, `related_to`↔notes) | Blur-autosave Markdown prose (`SummarySection` / `NotesSection` via `RichTextEditor`); Case rename/description/egress (`CaseSettingsForm` — field drafts + mutation) |
|  | `SearchField` / queue filter facets (live filter, no submit) |
|  | `DestructiveConfirmDialog` type-to-confirm gate |

**Conventions**

- Wire client validators to the same domain Zod schemas used on ServerFns when shapes align (Zod v4 Standard Schema — no `@tanstack/zod-form-adapter`).
- Server/mutation failures: `catch` → `FormInlineError` / toast via plain `useState` — not TanStack Form’s error map / `isSubmitSuccessful`.
- One self-contained `useForm` per composer; do not split one form across children via context. Create vs edit = two `useForm` instances (share config with `formOptions` if needed).
- Shared claim create/edit: `dossier/lib/claim-form.ts` (`claimFormOptions`, `claimEvidenceIdsValidator`) → one `ClaimComposer` in `claims-section.tsx`.
- Triage Accept/Reject: `useTriageDetailForms` (`triage/hooks/use-triage-detail-forms.ts`) — two `useForm` instances; do not split across children. Accept composer values: `AcceptFormValues` in `triage/types.ts` (imported by hooks + Detail — not defined under `components/`).
- Confirmed↔evidence gate + copy: `dossier/lib/confirmed-evidence.ts` (also Triage + connection dialog).
- Every field: `onBlur={field.handleBlur}`; validators return `string | undefined`; gate onChange/onBlur errors with `isTouched`; use `form.Subscribe` with narrow selectors; `evidenceIds` is a plain `string[]` field (not `mode="array"`).
- Split-view queue URL SoT: `resolveQueueSelection` (`shared/lib/queue-selection.ts`) + render-time `<Navigate replace>` when URL ≠ resolved selection (Collect / Triage) — not a sync `useEffect` that calls the parent navigate callback. Collect may pass `holdMissingUrlId` so a just-started (or filter-hidden) job id is not Navigate-clobbered.

## Multi-mode UI (Detail / composers)

Prefer **mode composition** over nested ternaries when a surface has mutually exclusive layouts (pending vs decided, accept vs reject, add vs edit). Chip-level `{cond ? <X/> : null}` is fine.

| Pattern | Use when | Example |
| --- | --- | --- |
| Early `return` / mode child components | Whole branch differs | `PendingDecideBand` / `DecidedDecideBand` |
| Pure `build*View()` in `lib/` | Several flags drive chrome | `decide-header-view.ts`, `job-detail-view.ts`, Cap/playbook seed views |
| One discriminant for exclusive actions | Parallel busy flags drift | Intake `pending: { kind; evidenceId }` — not four ID booleans |
| Exhaustive `switch` + `never` | Discriminated unions | `ArtifactPreviewBody`, vocab, status edges |
| `ActiveTabBody` + `TabsContent` | Stack / Detail tabs | Case · Dossier · Collect (Evidence detail) — **conditional unmount** (not React `<Activity>`) for heavy canvases |

Reference: Triage decide chrome (`triage-decide-header.tsx` + `triage-decide-footer.tsx` + `lib/decide-header-view.ts`). Official React guidance: [Conditional Rendering](https://react.dev/learn/conditional-rendering), [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure).

## Hand-owned atoms (highlights)

`ActiveTabBody` / `SuspenseTabBody`, `LoadingRegion`, `RegionBoundary`, `PendingRegion`, `SectionLabel`, `SectionHeaderBar`, `FormSection`, `MetaRow` / `MetaGrid` (Detail/drawer key-value — not form helpers, not queue titles), `shared/ui/vocab` badges, `IdChip` + `MiddleTruncate` (opaque ids/hashes; `ds:ban` blocks `.slice(0,N)`), `EntityMention` (linked entity name — not inside row-click tables), `RelativeTime`, `Timestamp`, `StatusDot`, `SearchField`, `DestructiveConfirmDialog`, `EntityCombobox` / `FieldCombobox` / `FieldSelect` / `ConfidenceSelect` (options in; no I/O; Combobox may set `group` for headings), `FormInlineError` / `ComposerShell`, Queue + Detail + `QueueShell` + `SplitView` + `ArtifactPreview`, `DetailFooter` / `DetailStatusChip`, `DataTable` kit (+ editable cells / append composer; **`pending` per cell**), graph kit (`GraphCanvas` / `EntityNode` / `GraphEdgePath`), `RichTextEditor` / `RichTextViewer` (Markdown string SoT — dossier Summary/Notes), `InlineLoading`, `Spinner`, `FetchErrorAlert`, `Empty` / `EmptyState`, hand skeletons in `skeletons.tsx`. Page chrome (`PageToolbar` / `PageFilterMenu` / `RouteError`; `RoutePending` for `defaultPendingComponent` only) lives in `shared/layout/`. Style guide: **`/ui`**. New atoms: `pnpm --filter @watchdog/web ds:atom -- <Name> <file>`.

Domain evidence pickers: `dossier/components/evidence-picker.tsx` (`EvidencePicker`, `EvidenceCiteChips`) — dossier composers + Triage Accept; not `shared/ui`.

### Component job matrices

| Need | Use |
| --- | --- |
| Dense job lifecycle in a row | `StatusDot` (`pulse` only when `running` + opted in) |
| Scannable text status | `StatusBadge` |
| Confidence / kind / review | domain badges — ≤1–2 per row cluster |
| Opaque id / hash / path | `IdChip` (not Badge) |
| Inline entity name (+ optional dossier link) | `EntityMention` |
| Long searchable enum (edge phrases) | `FieldCombobox` (optional `group` → section headings) |
| Tiny closed string enum | `FieldSelect` |
| Detail key/value | `MetaRow` / `MetaGrid` |
| Glued sibling actions | `ButtonGroup` (pagination, step) |
| 2–3 exclusive view modes | `ToggleGroup` (not boolean `Switch`; not `Tabs` when the trigger owns no panel — e.g. Jobs Cap/Playbook run mode, whose form sits in the queue toolbar) |
| Unrelated CTAs / dialog footer | `flex` + `gap` — don’t ButtonGroup everything |
| Adorned field (icon, eye, kbd) | `InputGroup` |
| Toolbar filter search | `SearchField` — not InputGroup |
| Button icons / Spinner in Button | `data-icon="inline-start\|inline-end"` |

Button sizes: PageHeader / toolbar → `sm` (or default); Queue row / dense icon actions → `xs`.

## Loading skeletons

Hand-built skeleton components in [`skeletons.tsx`](../src/shared/ui/skeletons.tsx) mirror real layout so pending → loaded transitions avoid layout shift. Domains wrap **data slots only** with `PendingRegion` from [`pending-region.tsx`](../src/shared/ui/pending-region.tsx) — `LoadingRegion` + a `fallback` skeleton when `loading` is true. **Exception: `DataTable`** — see [Tables](#tables) below; do not wrap table bodies in `PendingRegion`.

| Piece | Path |
| --- | --- |
| Gate | [`pending-region.tsx`](../src/shared/ui/pending-region.tsx) — `loading` + `label` + `fallback` |
| Shapes | [`skeletons.tsx`](../src/shared/ui/skeletons.tsx) — `*Skeleton` fallbacks + `*SkeletonLayout` building blocks |
| Stack tabs | [`stack-pending-fallback.tsx`](../src/shared/ui/stack-pending-fallback.tsx) — `stackPendingFallback(sections?)` |
| Router floor | [`default-route-pending-shell.tsx`](../src/shared/ui/default-route-pending-shell.tsx) |

Share row counts / grid templates between live UI and skeleton via exported constants (e.g. `COLLECT_QUEUE_SKELETON_ROW_COUNT`). **`PendingRegion` fallbacks use `*Skeleton`;** inner blocks are `*SkeletonLayout`. Unknown shape → small centred spinner (`InlineLoading`), not a misleading skeleton.

### Tables

`DataTable` is `table-fixed` with a `<colgroup>` from TanStack `column.size`. Flex skeleton overlays **cannot align** with column headers — you get blank carrier rows and shifted bars.

| Do | Don’t |
| --- | --- |
| `pending={listPending(query)}` on `DataTable` | `PendingRegion` on table bodies |
| One skeleton bar **per cell** under the mounted header (built into `DataTable`) | `TableBodySkeletonLayout` in production table paths |
| `pendingLabel` for screen readers (`aria-busy` on table wrapper) | Hoisting `<tr>` skeletons inside a single `<td>` |
| Every column defines `size` ([Table columns](#table-columns)) | Overlay skeleton in one `colSpan` cell |

Surfaces: `/entities`, `/identifiers` (`entity-table.tsx`, `identifiers-page.tsx`). Dossier Identifiers tab uses `useSuspenseQuery` inside the tab — parent Suspense, no `pending`.

## Loading & hydration (implementation)

**SSR split:** `useSuspenseQuery` fetches during SSR and ships data in the HTML; `useQuery` returns pending on the server and fetches after hydration. Thin loaders + in-page skeletons trade a fully-populated first paint for client-navigation responsiveness — deliberate for this app.

Router: `defaultPendingMs=400`, `defaultPendingMinMs=500`, `defaultPendingComponent` (minimal shell floor), `defaultErrorComponent: RouteError` (retry via `router.invalidate()`).

### Sixteen rules

Lead with “don’t skeleton at all” — skeletons are the fallback of last resort ([Viget](https://www.viget.com/articles/a-bone-to-pick-with-skeleton-screens): skeletons can feel slower than blank or spinner on unfamiliar UIs; our operator-facing queues are familiar enough that shape-correct skeletons still help, but reach for less first).

#### Don't skeleton at all (14–15)

| # | Rule |
| --- | --- |
| 14 | **Skeleton is last resort.** If a lesser-but-_true_ rendering exists, show it and upgrade in place — never cover real content with a skeleton overlay. Reference: [`code-block.tsx`](../src/shared/ui/code-block.tsx) renders raw code in the same `<pre>` while shiki tokenizes; no skeleton, no layout shift. |
| 15 | **Key change = update, not new page.** Filter/sort/search transitions use `placeholderData: keepPreviousData` + subtle `isPlaceholderData` de-emphasis (`opacity-60`). Never `initialData` to fake a filtered page — that caches a guess as fetched. |

#### Shape (1, 3, 12)

| # | Rule |
| --- | --- |
| 1 | **Static shell never suspends or skeletons** — `Page`, `PageHeader`, toolbar, filter chrome, tab strip, split frame, table header + pagination, queue header. |
| 3 | **Shape parity or nothing** — skeletons inside the real container; row count / grid template from a shared constant both live + skeleton import. Median row count, not max. Unknown shape → small centred spinner. **Tables:** shape parity = `DataTable` `pending` per-cell rows under real `<colgroup>`. |
| 12 | **Hydration-safe skeletons** — no `window`, `localStorage`, `Date.now()`, or random values in skeleton output. |

#### State (4–6)

| # | Rule |
| --- | --- |
| 4 | **Keep router thresholds** — no sub-400ms skeletons (reads as glitch). |
| 5 | **Refetch ≠ pending; loading ≠ empty** — `listPending()` / `isLoading \|\| !isFetched` gates skeleton; error → error UI; empty only when settled. `isFetching` → at most soft de-emphasis ([`recent-activity.tsx`](../src/domains/dashboard/components/recent-activity.tsx) `opacity-60`). |
| 6 | **No confident wrong values** — `0` meaning “unknown” is worse than a bone; no fabricated placeholder objects in live chrome. |

#### A11y & motion (7–8)

| # | Rule |
| --- | --- |
| 7 | **One loading event, three channels** — `LoadingRegion`: `aria-busy` on region, `aria-hidden` on skeleton subtree, sibling `role="status"` sr-only label _outside_ the hidden subtree. |
| 8 | **`prefers-reduced-motion` stops animation** — in-place pulse only (`animate-pulse` on `[data-slot=skeleton]`); no travelling shimmer. |

#### Fetch discipline (2, 9–11)

| # | Rule |
| --- | --- |
| 2 | **Loaders await identity only** — `casesContextQuery` + at most one title row; lists via `warm*Queries`. |
| 9 | **>1 `useSuspenseQuery` → `useSuspenseQueries`** — serial calls waterfall on cold cache _and_ SSR TTFB; warm-helper parity is not structural. |
| 10 | **Fetch only what's visible** — no query in collapsed panels or inside `.map()`; gate artifact content on `open`. |
| 11 | **One SSE connection per case** — `useLiveEvents` ref-counts a shared `EventSource`; nested workspaces pass `live: false`. |

#### Boundaries (13, 16)

| # | Rule |
| --- | --- |
| 13 | **One pending surface per route** — `pendingComponent` _or_ in-page `RegionBoundary` + skeleton, never both for the same region. Exception: `ssr:false` / `ssr:'data-only'` routes need `pendingComponent` (or `defaultPendingComponent`). |
| 16 | **Error granularity = pending granularity** — every `RegionBoundary` gets scoped `QueryErrorResetBoundary` + `ErrorBoundary` + `Suspense`; one failed region must not blank the shell. Mutations stay on `onError` / toasts. |

### ds:check loading bans

| Ban | Use instead |
| --- | --- |
| `RoutePending` import in `routes/**` | In-page `RegionBoundary` / `PendingRegion` (`// ds:allow-route-pending` only for `ssr:false` / `defaultPendingComponent`) |
| `shadcn/skeleton` import in `domains/**` | `PendingRegion` from `@/shared/ui/pending-region` (fallback: `shared/ui/skeletons.tsx`). **Tables:** `DataTable` `pending` only — kit owns per-cell skeletons |
| `animate-pulse` outside `shared/ui/` | `Skeleton` primitive (reduced-motion guard) |
| `aria-busy` outside `shared/ui/` | `LoadingRegion` |
| `await Promise.all` in route `loader` (excl. `routes/api/**`) | Thin loader + `warm*Queries` |
| 2+ `useSuspenseQuery` per file | `useSuspenseQueries` (`// ds:allow-use-suspense-query — reason` per line if intentional) |

Escape hatch: `// ds:allow-<rule> — reason` on the line above a flagged line; `ds:check` reports active allow count.

### Warm helpers

Loaders await **identity only**; each route calls its matching helper with `void queryClient.prefetchQuery(...)` (never `await Promise.all` in loaders — `routes/api/**` excluded).

See [`DATA.md`](DATA.md) for the full helper ↔ route table and parity rule.

### Route patterns

| Layout | Loader | Pending UI |
| --- | --- | --- |
| **Split Queue** (Collect, Triage) | Collect: identity + **await** `ensureCollectQueueQueries` (+ `ensureCollectJobDetailWhenSelected` when `?id=`); Triage: identity + `warmTriageQueries` | Collect: `PendingRegion` only on cache miss / hidden filter / job detail. Triage: `RegionBoundary` → `TriageSplitPendingFallback` |
| **Table** (Entities, Identifiers) | Identity + `warmEntitiesQueries` / `warmIdentifiersQueries` | `DataTable` `pending` + `pendingLabel` — per-cell skeleton rows ([§ Tables](#tables)) |
| **Board** (Tasks) | Identity + `warmTasksQueries` | `PendingRegion` + `BoardSkeleton` |
| **Card grid** (Cases) | Identity only | `PendingRegion` + `CardGridSkeleton` |
| **Graph** | Identity + `ensureGraphQueries` | `GraphCanvasLoadingRegion` (hand skeleton) |
| **Stack** (Dossier, Dashboard, Settings tabs) | Identity + `warmDossierQueries` / `warmDashboardQueries` / … | `ActiveTabBody` or `RegionBoundary` + `stackPendingFallback()` |
| **Case Overview** | Identity + `warmCaseOverviewQueries` | `CaseOverviewPending` (`case-overview-pending.tsx`) |

Button / mutation wait: Button `loading` / `InlineLoading` / `Spinner` — not page skeleton. No data: `EmptyState` / `DetailEmpty` — never Skeleton.

### Loading & empty inventory

Per-surface map for first paint, filtered empty, and fetch failure. Load failures use `FetchErrorAlert` (or route `RouteError` / `RegionBoundary` when the region is Suspense-backed) — never `EmptyState`.

| Surface | First load | No results / cleared | Fetch error | Notes |
| --- | --- | --- | --- | --- |
| **Collect** queue | `PendingRegion` + queue skeleton only on `listPending` cache miss (loader awaits evidence/jobs/entities) | `EmptyState` `blank-slate` / `no-results` | `FetchErrorAlert` in queue body | Hidden filter may skeleton once; job-only detail skeleton until `jobDetailQuery` settles (loader awaits when `?id=` is a job). |
| **Triage** queue + detail | `RegionBoundary` → `TriageSplitPendingFallback`; proposals via `useSuspenseQuery` | `EmptyState` `blank-slate` / `cleared` / `no-results` | `RegionBoundary` → `FetchErrorAlert` | Split wrapped in `RegionBoundary`. |
| **Tasks** board | `PendingRegion` + `BoardSkeleton` (`listPending`) | implicit empty columns | route `RouteError` | Workspace uses `useSuspenseQuery` for tasks/entities. |
| **Cases** grid | `PendingRegion` + `CardGridSkeleton` | `EmptyState` `no-results` (search) | route `RouteError` | `casesContextQuery` via `useQuery` + `listPending`. |
| **Entities** / **Identifiers** tables | `DataTable` `pending` + per-cell skeletons | `EmptyState` in table body | route `RouteError` | Tab body Suspense-backed. |
| **Dashboard** panels | `RegionBoundary` / tab skeletons per panel | Recent Activity `EmptyState`; triage/tasks panels dashed inline empty | route `RouteError` | Activity uses `useSuspenseQuery`; refetch de-emphasis only. |

### Rejected loading “delight” patterns

External skeleton/loading skills often recommend shimmer, staggered section entry, content fade-in, and in-page min-display (~500ms). **Do not adopt** on Operate surfaces — they conflict with [Motion](#motion-operate) and rules 4, 8, 14 above. Router-only pending floor (`defaultPendingMs` / `defaultPendingMinMs`) stays; in-page `listPending()` must drop instantly on cache hit.

Hydration: suppress relative time / session name when needed; no nested `<button>` (`WithTooltip` `wrapSpan`; full-width run headers use `CollapsibleTrigger` `nativeButton={false}` + `render={<div />}` with `stopPropagation` on copyable `IdChip`); `SplitView` static flex pre-hydration.

## Motion (Operate)

- High-frequency paths (Queue select, Detail swap): instant or ≤100ms **color-only** (`--duration-fast`)
- Panels/dialogs: ≤100–180ms (`--duration-panel`); no page-mount fades, stagger, blur entrances, or AnimatePresence on Queue/Detail
- Selection = amber wash/bar — not pulse
- Button press `scale(0.97)` OK; no bounce/elastic
- Infinite pulse: skeletons (gated by reduced-motion) or StatusDot `running` only — not live badges generally

## UI PR checklist

1. [ ] Semantic tokens / existing primitives — refuse list above
2. [ ] Shell not replaced by skeleton; loading matrix followed
3. [ ] Loading / empty / error / success share footprint in the data region
4. [ ] Chrome lexicon above — no banned surface nouns
5. [ ] `shared/ui` remains no-I/O
6. [ ] Opaque ids via `IdChip` / `formatOpaqueId` (no `.slice`)
7. [ ] Right control for the job (ButtonGroup / ToggleGroup / SearchField / badges)
8. [ ] `pnpm --filter @watchdog/web ds:check` passes
9. [ ] New hand-owned atom? Update `wd-ui-files.mjs` + `COMPONENTS.md` (under `shared/ui/`, not `shadcn/` or `__tests__/`)
