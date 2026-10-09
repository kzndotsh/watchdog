# UI: hand-owned atoms

Which atom for which need, the keyboard contracts, and the traps. The atoms themselves are in `apps/web/src/shared/ui/` (code and JSDoc are the registry); the style guide and specimen page is **`/ui`**. New atoms go in `shared/ui/` and get a `/ui` specimen. `shared/ui` never fetches, mutates, or routes (`guidance`: nothing enforces it).

## Which atom

| Need | Use |
| --- | --- |
| Dense job lifecycle in a row | `StatusDot`: shape-coded glyph from `STATUS_GLYPH`; `pulse` spins `running` only |
| Scannable text status | `StatusInk` (Detail strips) or `StatusBadge` (tables) |
| Confidence / kind / review | Domain badges, at most 1-2 per row cluster |
| Opaque id / hash / path | `IdChip` (not Badge) |
| Inline entity name (+ dossier link) | `EntityMention` |
| Who acted | `ActorMention` (`prefix="By"` on Detail/Activity; no chip) |
| Long searchable enum (edge phrases) | `FieldCombobox` (optional `group` headings) |
| Tiny closed string enum | `FieldSelect` |
| Detail key/value | `MetaRow` / `MetaGrid` |
| Detail context strip | `DetailContextHeader` + `StatusInk` + plain `span` tags + `ActorMention` |
| Glued sibling actions | `ButtonGroup` (pagination, step); unrelated CTAs use `flex` + `gap` |
| 2-3 exclusive view modes | `ToggleGroup`; `Tabs` only when the trigger owns a panel |
| Adorned field (icon, eye, kbd) | `InputGroup` |
| Toolbar filter search | `SearchField` (fixed width; don't override per page) |
| Evidence pickers | `EvidencePicker` / `EvidenceCiteChips` in `shared/ui/intake/evidence-picker.tsx` |

Button sizes: PageHeader and toolbars use `sm` (or default); Queue rows and dense icon actions use `xs`. Button icons use `data-icon="inline-start|inline-end"`.

**Labels:** display labels for schema enums live in `shared/ui/vocab/` (exhaustive label and tone maps). `@watchdog/schemas` stays free of UI and the CLI emits raw enums. Tone maps reuse the existing `--status-*` tokens; a badge is named for its meaning (`ConfidenceBadge`), never its color. There is no fictional vocab (`probable`, `dormant`, `merged`): the label and tone maps are exhaustive `Record`s over the schema unions, so typecheck enforces it for them.

## Keyboard

- `QueueShell` owns Queue keyboard flow (`shared/lib/queue-keyboard.ts`): `j` / `k` anywhere outside editable fields, arrow keys while focus is in the Queue. It clicks the next `[data-slot=queue-row]`, so each Queue keeps its own `onSelect` and URL wiring. Opt out with `keyboard={false}`.
- Single-key actions are declarative: `data-hotkey="<key>"` + `aria-keyshortcuts` on the control and a `Kbd` hint inside it. `useDataHotkeys` (mounted in `SearchChrome`) clicks the first live match, so disabled controls stay gated. Add every shortcut to `HOTKEYS` so the Shortcuts dialog lists it.
- Render Mod-chord hints through `useModKeyLabel` (`shared/hooks`), not `modKeyLabel()` in render: server and first client render say "Ctrl" and the platform glyph lands after mount, so hydration never mismatches.
- A surface registers page commands with `usePaletteCommands(actions)` (`shared/lib/palette-commands.ts`); Mod+K lists them under **This Page**. Reuse the AppAction the button or menu runs.
- `SearchChrome` binds Mod+K and `?` only. Mod+B belongs to the vendored `SidebarProvider` ([`vendor.md`](vendor.md)); don't bind it again (two listeners toggle twice and cancel out).

## Variants, not overrides

Callers place components (layout classes, `truncate`) and pick a size or variant; they do not patch a component's spacing, type, color, or shape with `className`. Enforced in `domains/` and `routes/` by `shadcn/no-restyle` ([`rules.md`](rules.md)). If a screen needs a look the component lacks, use the stock component or a token. A pattern with its own meaning gets its own name in `shared/ui` and composes vanilla primitives (`QueueRow`, `StatusDot`, `EmptyState size="sm"`). Which components have Watchdog wrappers, and how: [`vendor.md`](vendor.md).

## Gotchas

- **`react-resizable-panels` v4:** numeric `defaultSize` / `minSize` / `maxSize` are pixels; strings without units are percentages. Use strings like `"34%"`. Panel ids must be unique per group: pass `groupId` to `SplitView`. No `autoSaveId` on the vendor wrapper (DOM warning).
- **`<button>` inside `<button>`:** Base UI `TooltipTrigger` defaults to `<button>`; use `render={<span />}` or `WithTooltip wrapSpan` inside queue row buttons. `CollapsibleTrigger` is also a `<button>`: use `nativeButton={false}` + `render={<div />}` when the header holds copyable `IdChip`s or other buttons (and `stopPropagation` on the inner wrapper). Nothing lints this; it surfaces as a hydration error.
- **Button as Link:** Base UI `Button` + `render={<Link />}` needs `nativeButton={false}`.
- **`scrollbar-gutter: stable`** forces classic scrollbar mode and ignores `::-webkit-scrollbar`; avoid it on styled scroll areas.
- **Theme:** the toggle sets `.dark` / `.light` on `<html>` and toasts inherit the document's CSS variables; don't reintroduce `next-themes` without a provider.
- **Opaque ids:** never `.slice(0, N)` a hash or id in `domains/`; use `IdChip` / `formatOpaqueId` (`watchdog/no-opaque-id-slice` flags the common form only).
