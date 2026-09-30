# UI: hand-owned atoms

This page highlights Queue, SplitView, IdChip, and related atoms.

## Hand-owned atoms (highlights)

Key atoms include `ActiveTabBody`, `LoadingRegion`, `PendingRegion`, `DetailContextLine` / `DetailContextHeader` (muted inline context under split detail), `SectionLabel`, `SectionHeaderBar`, `FormSection`, and `MetaRow` / `MetaGrid` (Detail/drawer key-value, not form helpers or queue titles). The inventory also includes `shared/ui/vocab` badges; `StatusInk` (status glyph + colored word in Detail strips); `IdChip` + `MiddleTruncate` (opaque ids/hashes; `ds:ban` blocks `.slice(0,N)`); `EntityMention` (linked entity names, not for row-click tables); `ActorMention` (optional `By` prefix, AtSign glyph + handle, no chip); `RelativeTime`; `Timestamp`; `StatusDot`; `SearchField`; and `DestructiveConfirmDialog`.

Picker atoms are `EntityCombobox` / `FieldCombobox` / `FieldSelect` / `ConfidenceSelect` (options in, no I/O; Combobox may set `group` for headings). Other shared atoms are `FormInlineWarning` / `ComposerShell`, Queue + Detail + `QueueShell` + `SplitView` + `ArtifactPreview`, `DetailFooter` / `DetailStatusChip`, the `DataTable` kit (+ editable cells / append composer; **`pending` per cell**), the graph kit (`GraphCanvas` / `EntityNode` / `GraphEdgePath`), `RichTextEditor` (Markdown string source of truth for dossier Summary/Notes), `InlineLoading`, `Spinner`, `FetchErrorAlert`, `Empty` / `EmptyState`, and hand skeletons in `skeletons.tsx`. Page chrome (`PageToolbar` / `PageFilterMenu` / `RouteError`; `RoutePending` for `defaultPendingComponent` only) is in `shared/layout/`. The style guide is **`/ui`**. Add new atoms with `pnpm --filter @watchdog/web ds:atom: <Name> <file>`.

Evidence pickers live in `shared/ui/intake/evidence-picker.tsx` (`EvidencePicker`, `EvidenceCiteChips`); dossier composers + Triage Accept import them from there.

### Component job matrices

| Need | Use |
| --- | --- |
| Dense job lifecycle in a row | `StatusDot`: shape-coded glyph from `STATUS_GLYPH` (same-hue statuses never share a shape); `pulse` spins `running` only |
| Scannable text status | `StatusInk` (Detail strips) · `StatusBadge` (tables) |
| Confidence / kind / review | domain badges: ≤1-2 per row cluster |
| Opaque id / hash / path | `IdChip` (not Badge) |
| Inline entity name (+ optional dossier link) | `EntityMention` |
| Who acted (`By` + AtSign glyph + handle, or `api-key:…`) | `ActorMention` (`prefix="By"` on Detail/Activity; no chip) |
| Long searchable enum (edge phrases) | `FieldCombobox` (optional `group` → section headings) |
| Tiny closed string enum | `FieldSelect` |
| Detail key/value | `MetaRow` / `MetaGrid` |
| Detail context strip (Entity · From · By @actor) | `DetailContextHeader` + `DetailContextSep` · `StatusInk` · plain `span` tags · `ActorMention` |
| Glued sibling actions | `ButtonGroup` (pagination, step) |
| 2-3 exclusive view modes | `ToggleGroup` (not boolean `Switch`; not `Tabs` when the trigger owns no panel: e.g. Jobs Cap/Playbook run mode, whose form sits in the queue toolbar) |
| Unrelated CTAs / dialog footer | `flex` + `gap`: don't ButtonGroup everything |
| Adorned field (icon, eye, kbd) | `InputGroup` |
| Toolbar filter search | `SearchField`: CONTROL chrome + fixed `SEARCH_FIELD_WIDTH` (`w-80`); not raw `InputGroup`; don't override width per page |
| Button icons / Spinner in Button | `data-icon="inline-start\|inline-end"` |

Button sizes: PageHeader / toolbar → `sm` (or default); Queue row / dense icon actions → `xs`.

### Keyboard

- `QueueShell` owns Queue keyboard flow (`shared/lib/queue-keyboard.ts`): `j` / `k` anywhere outside editable fields, ↑ / ↓ while focus is in the Queue. It clicks the next `[data-slot=queue-row]`, so each Queue keeps its own `onSelect` → URL wiring. Only the most recently mounted Queue listens; opt out with `keyboard={false}`.
- Single-key actions are declarative: put `data-hotkey="<key>"` + `aria-keyshortcuts` on the control and a `Kbd` hint inside it. `useDataHotkeys` (mounted in `SearchChrome`) clicks the first live match, so disabled / gated controls stay gated. Add every shortcut to `HOTKEYS` so the Shortcuts dialog lists it.
- Page commands: a surface calls `usePaletteCommands(actions)` (`shared/lib/palette-commands.ts`) with its `page` AppActions; Mod+K lists them under **This Page** while it is mounted. Reuse the same AppAction the button or ⋯ menu runs; don't fork a palette-only handler.

### Variants, not overrides

Callers place components (layout classes, `truncate`) and pick a size or variant; they don't patch a component's spacing, type, color, or shape with `className` (`no-restyle`, see [`rules.md`](rules.md)). If a screen needs a look the component lacks, use the stock component or a token; never patch the vendored primitive or the call site.

**Two layers.** `@watchdog/ui` (`packages/ui`) holds the shadcn primitives exactly as the CLI writes them (`base-mira`); nobody edits them (see [`vendor.md`](vendor.md)). Domain code imports vanilla primitives straight from `@watchdog/ui/components/<name>`. Where a behavior must apply everywhere, `apps/web/src/shared/ui/primitives/<name>.tsx` is a **same-name wrapper** that composes the untouched upstream component; oxlint bans the vanilla path for exactly those components (the list follows the folder).

| Wrapper | Adds |
| --- | --- |
| `button` | `loading` spinner + disable; `data-variant` / `data-size` / `data-loading` hooks (dialog Enter-to-confirm and coarse-pointer sizing key on them) |
| `dialog`, `alert-dialog` | Enter confirms the default action (`enterConfirms`); `AlertDialogAction` runs on our Button so it can show `loading` |
| `input`, `textarea` | `mono` (ids, hashes, paths) |
| `combobox` | `ComboboxInput tone="warning"` (data leaves the machine) |

Anything that is only a different look is not a wrapper: use the stock component, or a CSS token if it should change everywhere. A pattern with its own meaning gets its own name in `shared/ui` and composes vanilla primitives (`toast` helpers, `QueueRow`, `StatusDot`, `EditableTextCell variant="title"`, `EmptyState size="sm"` / `framed`, `RowActionsMenu alwaysVisible`).

Mira sets the density scale (Button default `h-7`, `sm` `h-6`, `xs` `h-5`; Inputs 12px at `md+`), so don't add `text-xs` / `h-*` patches to match the old scale. Density comes from Mira, so don't add `text-xs` / `h-*` patches to a screen.

## Gotchas

- **`react-resizable-panels` v4 API**: `defaultSize`, `minSize`, `maxSize`: numbers = pixels, strings without units = percentages. Always use strings like `"34%"`. Vendor panel IDs must be unique per group: use `groupId` on `SplitView`. Do not put `autoSaveId` on the vendor wrapper (DOM warning).
- **`<button>` inside `<button>`**: Base UI `TooltipTrigger` defaults to `<button>`. Use `render={<span />}` or `WithTooltip` `wrapSpan` inside queue row buttons. Default `CollapsibleTrigger` is also a `<button>`: use `nativeButton={false}` + `render={<div />}` when the header needs a full-width hit target with copyable `IdChip` or other buttons inside (`stopPropagation` on the interactive wrapper). Used on Collect run cards, Triage patch cards, and `ArtifactPreview`.
- **`scrollbar-gutter: stable`** forces classic scrollbar mode and ignores `:-webkit-scrollbar`: avoid on styled scroll areas.
- Theme toggle sets `.dark` / `.light` on `<html>`. Toast inherits CSS variables from the document theme: do not reintroduce `next-themes` without a provider.
- **Opaque ids**: never `.slice(0, N)` on hashes/ids in domains; use `IdChip` / `formatOpaqueId` (`ds:ban` greps this).
- **Button as Link**: Base UI `Button` + `render={<Link />}` needs `nativeButton={false}` or you get nested interactive elements / wrong semantics.
