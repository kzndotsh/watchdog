# UI: hand-owned atoms

This page highlights Queue, SplitView, IdChip, and related atoms.

## Hand-owned atoms (highlights)

Key atoms include `ActiveTabBody` / `SuspenseTabBody`, `LoadingRegion`, `RegionBoundary`, `PendingRegion`, `DetailContextStrip` / `DetailContextHeader` (muted inline context under split detail), `SectionLabel`, `SectionHeaderBar`, `FormSection`, and `MetaRow` / `MetaGrid` (Detail/drawer key-value, not form helpers or queue titles). The inventory also includes `shared/ui/vocab` badges; `StatusInk` (dot + colored word in Detail strips); `IdChip` + `MiddleTruncate` (opaque ids/hashes; `ds:ban` blocks `.slice(0,N)`); `EntityMention` (linked entity names, not for row-click tables); `ActorMention` (optional `By` prefix, AtSign glyph + handle, no chip); `RelativeTime`; `Timestamp`; `StatusDot`; `SearchField`; and `DestructiveConfirmDialog`.

Picker atoms are `EntityCombobox` / `FieldCombobox` / `FieldSelect` / `ConfidenceSelect` (options in, no I/O; Combobox may set `group` for headings). Other shared atoms are `FormInlineError` / `ComposerShell`, Queue + Detail + `QueueShell` + `SplitView` + `ArtifactPreview`, `DetailFooter` / `DetailStatusChip`, the `DataTable` kit (+ editable cells / append composer; **`pending` per cell**), the graph kit (`GraphCanvas` / `EntityNode` / `GraphEdgePath`), `RichTextEditor` (Markdown string source of truth for dossier Summary/Notes), `InlineLoading`, `Spinner`, `FetchErrorAlert`, `Empty` / `EmptyState`, and hand skeletons in `skeletons.tsx`. Page chrome (`PageToolbar` / `PageFilterMenu` / `RouteError`; `RoutePending` for `defaultPendingComponent` only) is in `shared/layout/`. The style guide is **`/ui`**. Add new atoms with `pnpm --filter @watchdog/web ds:atom: <Name> <file>`.

Evidence pickers live in `shared/ui/intake/evidence-picker.tsx` (`EvidencePicker`, `EvidenceCiteChips`); dossier composers + Triage Accept import them from there.

### Component job matrices

| Need | Use |
| --- | --- |
| Dense job lifecycle in a row | `StatusDot` (`pulse` only when `running` + opted in) |
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
| Toolbar filter search | `SearchField`: not InputGroup |
| Button icons / Spinner in Button | `data-icon="inline-start\|inline-end"` |

Button sizes: PageHeader / toolbar → `sm` (or default); Queue row / dense icon actions → `xs`.

## Gotchas

- **`react-resizable-panels` v4 API**: `defaultSize`, `minSize`, `maxSize`: numbers = pixels, strings without units = percentages. Always use strings like `"34%"`. Vendor panel IDs must be unique per group: use `groupId` on `SplitView`. Do not put `autoSaveId` on the vendor wrapper (DOM warning).
- **`<button>` inside `<button>`**: Base UI `TooltipTrigger` defaults to `<button>`. Use `render={<span />}` or `WithTooltip` `wrapSpan` inside queue row buttons. Default `CollapsibleTrigger` is also a `<button>`: use `nativeButton={false}` + `render={<div />}` when the header needs a full-width hit target with copyable `IdChip` or other buttons inside (`stopPropagation` on the interactive wrapper). Used on Collect run cards, Triage patch cards, and `ArtifactPreview`.
- **`scrollbar-gutter: stable`** forces classic scrollbar mode and ignores `:-webkit-scrollbar`: avoid on styled scroll areas.
- Theme toggle sets `.dark` / `.light` on `<html>`. Sonner must follow `document.documentElement` class: do not reintroduce `next-themes` without a provider.
- **Opaque ids**: never `.slice(0, N)` on hashes/ids in domains; use `IdChip` / `formatOpaqueId` (`ds:ban` greps this).
- **Button as Link**: Base UI `Button` + `render={<Link />}` needs `nativeButton={false}` or you get nested interactive elements / wrong semantics.
