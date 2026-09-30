# UI: hand-owned atoms

This page highlights Queue, SplitView, IdChip, and related atoms.

## Hand-owned atoms (highlights)

Key atoms include `ActiveTabBody` / `SuspenseTabBody`, `LoadingRegion`, `RegionBoundary`, `PendingRegion`, `DetailContextLine` / `DetailContextHeader` (muted inline context under split detail), `SectionLabel`, `SectionHeaderBar`, `FormSection`, and `MetaRow` / `MetaGrid` (Detail/drawer key-value, not form helpers or queue titles). The inventory also includes `shared/ui/vocab` badges; `StatusInk` (status glyph + colored word in Detail strips); `IdChip` + `MiddleTruncate` (opaque ids/hashes; `ds:ban` blocks `.slice(0,N)`); `EntityMention` (linked entity names, not for row-click tables); `ActorMention` (optional `By` prefix, AtSign glyph + handle, no chip); `RelativeTime`; `Timestamp`; `StatusDot`; `SearchField`; and `DestructiveConfirmDialog`.

Picker atoms are `EntityCombobox` / `FieldCombobox` / `FieldSelect` / `ConfidenceSelect` (options in, no I/O; Combobox may set `group` for headings). Other shared atoms are `FormInlineError` / `ComposerShell`, Queue + Detail + `QueueShell` + `SplitView` + `ArtifactPreview`, `DetailFooter` / `DetailStatusChip`, the `DataTable` kit (+ editable cells / append composer; **`pending` per cell**), the graph kit (`GraphCanvas` / `EntityNode` / `GraphEdgePath`), `RichTextEditor` (Markdown string source of truth for dossier Summary/Notes), `InlineLoading`, `Spinner`, `FetchErrorAlert`, `Empty` / `EmptyState`, and hand skeletons in `skeletons.tsx`. Page chrome (`PageToolbar` / `PageFilterMenu` / `RouteError`; `RoutePending` for `defaultPendingComponent` only) is in `shared/layout/`. The style guide is **`/ui`**. Add new atoms with `pnpm --filter @watchdog/web ds:atom: <Name> <file>`.

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

Callers place components (layout classes: margin, width, grid/flex placement) and pick a size or variant; they don't patch a component's spacing, type, color, or shape with `className`. If a caller needs a look the component lacks, add a variant to the primitive. Examples: `Button size="xs"` (not `size="sm"` + `h-6 text-xs`); `FieldSet` is borderless with `gap-3` by default (the base CSS already zeroes border and padding); `FieldGroup density="cozy"` (gap-3, forms) / `"compact"` (gap-2, toolbars and popovers) and `Field density="compact"` (gap-1.5) replace hand-set gaps; `Label` is already 12px, so `FieldLabel` needs no `text-xs`.

Control variants: `Input` / `Textarea` take `size="sm"` (12px) and `mono`; `Input` also `size="lg"` (inline titles) and `variant="ghost"` / `"ghost-muted"` (inline metadata until focused) / `"bare"` (no chrome). `Button` adds `ghost-muted`, `ghost-destructive`, and `outline-destructive`. `EditableTextCell variant="title"` is the page-header rename. `EmptyState size="sm"` (tab-sized) and `framed` (dashed page empty); `RowActionsMenu alwaysVisible`; `Kbd tone="inherit"` (inside a colored Button). `Button variant="dashed" size="chip"` (add / count pills); `ToggleGroup variant="segmented"` (view-mode switch); `Card size="flush"` (rows own their padding); `SheetContent flush` and `PopoverContent flush` (children own spacing); `SidebarMenuButton variant="muted"`; `ComboboxInput size="sm"` and `tone="warning"`; `SelectTrigger size="sm"` is 12px. Where a caller only repeated a primitive's default (`PopoverContent` gap-2.5, `RadioGroup` gap-2, `DetailStatusChip size="sm"` gap-0.5), the override is simply gone. These live in the vendored shadcn files: re-apply after `shadcn add` overwrites `input.tsx`, `textarea.tsx`, `button.tsx`, or `field.tsx`.

## Gotchas

- **`react-resizable-panels` v4 API**: `defaultSize`, `minSize`, `maxSize`: numbers = pixels, strings without units = percentages. Always use strings like `"34%"`. Vendor panel IDs must be unique per group: use `groupId` on `SplitView`. Do not put `autoSaveId` on the vendor wrapper (DOM warning).
- **`<button>` inside `<button>`**: Base UI `TooltipTrigger` defaults to `<button>`. Use `render={<span />}` or `WithTooltip` `wrapSpan` inside queue row buttons. Default `CollapsibleTrigger` is also a `<button>`: use `nativeButton={false}` + `render={<div />}` when the header needs a full-width hit target with copyable `IdChip` or other buttons inside (`stopPropagation` on the interactive wrapper). Used on Collect run cards, Triage patch cards, and `ArtifactPreview`.
- **`scrollbar-gutter: stable`** forces classic scrollbar mode and ignores `:-webkit-scrollbar`: avoid on styled scroll areas.
- Theme toggle sets `.dark` / `.light` on `<html>`. Toast inherits CSS variables from the document theme: do not reintroduce `next-themes` without a provider.
- **Opaque ids**: never `.slice(0, N)` on hashes/ids in domains; use `IdChip` / `formatOpaqueId` (`ds:ban` greps this).
- **Button as Link**: Base UI `Button` + `render={<Link />}` needs `nativeButton={false}` or you get nested interactive elements / wrong semantics.
