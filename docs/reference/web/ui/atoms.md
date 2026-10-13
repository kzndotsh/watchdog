# UI: hand-owned atoms

Which atom for which need, the keyboard contracts, and the traps. The atoms themselves are in `apps/web/src/shared/ui/` (code and JSDoc are the registry); the style guide and specimen page is **`/ui`**. New atoms go in `shared/ui/` and get a `/ui` specimen. One file exports one component (`watchdog/one-component-per-file`); a family of related pieces is a folder of such files with an `index.ts` barrel that callers import from (`skeletons/`: one file per skeleton, grouped by screen, the barrel keeps `@/shared/ui/skeletons` stable), and a helper used by two or more of them lives in a `parts/` folder beside them. `shared/ui` never fetches, mutates, or routes (`guidance`: nothing enforces it) and imports no domain code (`watchdog/shared-ui-no-domain-imports`; a domain-shaped helper it needs lives in `shared/`).

## Which atom

| Need | Use |
| --- | --- |
| Dense job lifecycle in a row | `StatusDot`: shape-coded glyph from `STATUS_GLYPH`; `shouldPulse` spins `running` only |
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

Button sizes: PageHeader and toolbars use `sm` (or default); Queue rows and dense icon actions use `xs`. Button icons use `data-icon="inline-start|inline-end"`. The full scale is `xs` h-5, `sm` h-6, default h-7, `lg` h-8 (a primary action in a card or a filter bar), the square `icon-xs` h-5, `icon-sm` h-6, `icon` h-7, `icon-lg` h-8, and `inline` (h-auto, no padding, with `variant="link"`) for a text link that sits in running text. Same-role buttons use the same size in every domain; the specimens are on `/ui` (Atoms, "Button").

**Labels:** display labels for schema enums live in `shared/ui/vocab/` (exhaustive label and tone maps). `@watchdog/schemas` stays free of UI and the CLI emits raw enums. Tone maps reuse the existing `--status-*` tokens; a badge is named for its meaning (`ConfidenceBadge`), never its color. There is no fictional vocab (`probable`, `dormant`, `merged`): the label and tone maps are exhaustive `Record`s over the schema unions, so typecheck enforces it for them.

## Keyboard

- `QueueShell` owns Queue keyboard flow (`shared/hooks/use-queue-keyboard.ts`): `j` / `k` anywhere outside editable fields, arrow keys while focus is in the Queue. It clicks the next `[data-slot=queue-row]`, so each Queue keeps its own `onSelect` and URL wiring. Opt out with `keyboard={false}`.
- Single-key actions are declarative: `data-hotkey="<key>"` + `aria-keyshortcuts` on the control and a `Kbd` hint inside it. `useDataHotkeys` (mounted in `SearchChrome`) clicks the first live match, so disabled controls stay gated. Spread `hotkeyAttrs(id)` (`shared/lib/hotkeys.ts`) for the attributes and read the `Kbd` text from `hotkeyDef(id).chord`; never type the key twice.
- Render Mod-chord hints through `useModKeyLabel` (`shared/hooks`), not `modKeyLabel()` in render: server and first client render say "Ctrl" and the platform glyph lands after mount, so hydration never mismatches.
- A surface registers page commands with `usePaletteCommands(actions)` (`shared/lib/palette-commands.ts`); Mod+K lists them under **This Page**. Reuse the AppAction the button or menu runs.
- `HOTKEYS` (`shared/lib/hotkeys.ts`) is the only definition of a shortcut: id, label, chord, description, and an `owner` saying who attaches the listener (`global`, `sidebar-provider`, `queue-keyboard`, `data-hotkey`). An `AppAction` names its chord with `hotkey: <id>` (never a chord string); `SearchChrome` builds its bindings with `hotkeyBindings` (the `global` owners, Mod+K and `?`), the palette lists the entries flagged `isPalette`, and the Shortcuts dialog renders every entry. The registry centralizes shortcut metadata only: a new entry still needs its owner-specific implementation (a runner in `SearchChrome`'s `hotkeyBindings` call for `global`, `hotkeyAttrs(id)` on a control for `data-hotkey`, the queue listener for `queue-keyboard`).
- The composer's Mod+Enter save (`questions-section.tsx`) is a component-local shortcut outside the registry on purpose: it is not bound globally and is not listed in the Shortcuts dialog, and a registry entry would add it to that list. Its label still uses `useModKeyLabel`.
- Mod+B is `sidebar-provider`: the vendored `SidebarProvider` binds it ([`vendor.md`](vendor.md)), so `hotkeyBindings` skips it and the menu/palette action only runs `toggleSidebar`. Don't bind it again (two listeners toggle twice and cancel out).
- Mod-key text: `useModKeyLabel` / `formatChord(chord, label)`; never type `Ctrl` or the Apple glyph. The search minimum is `SEARCH_MIN_QUERY_LENGTH` (`@watchdog/schemas`), also in copy.

## Accessibility

- An icon-only control is the `Button` primitive with an accessible name (`aria-label` or an sr-only text child). `title` is a tooltip, not an accessible name: keep it only as a supplement. `react-doctor/shadcn-icon-button-requires-label` flags an unnamed icon-only `Button`; an icon-only raw `<button>` is not covered by any lint rule here, so it is `guidance`.
- A clickable card is a real `<button>`, never a `role="button"` element. A card that also holds controls (a `RowActionsMenu`) cannot nest one button in another: make the card a `relative` container, lay an `absolute inset-0` button over its content (name it with `aria-label`, give it the focus ring with `ring-inset`), and place the other controls after it so they paint above (`TaskCard`). Enter then activates it natively. On the Tasks board the dnd-kit `KeyboardSensor` lifts a card on Space only (`keyboardCodes` in `task-board.tsx`), so Enter selects and Space drags; `task-board-keyboard.component.test.tsx` checks both through the real sensors. Before this change Enter and Space both lifted the card and the ⋯ menu's Open was the only keyboard route to select it. No built-in lint rule covers this cleanly: `jsx-a11y/prefer-tag-over-role` also flags every Queue `role="option"` / `listbox`, so it stays off and `apps/web/src/lib/__tests__/source-conventions.test.ts` bans the `role="button"` literal.
- Typing delays (search, slug check) go through `useDebouncedValue` with a named constant from `shared/lib/debounce.ts`; see [`effects.md`](effects.md).

## Variants, not overrides

Callers place components (layout classes, `truncate`) and pick a size or variant (a Button's height is never a `className`: `watchdog/no-button-height-class`); they do not patch a component's spacing, type, color, or shape with `className`. Enforced in `domains/` and `routes/` by `shadcn/no-restyle` ([`rules.md`](rules.md)). If a screen needs a look the component lacks, use the stock component or a token. A pattern with its own meaning gets its own name in `shared/ui` and composes vanilla primitives (`QueueRow`, `StatusDot`, `EmptyState size="sm"`). Which components have Watchdog wrappers, and how: [`vendor.md`](vendor.md).

## Props types

A component with more than two props declares a named `type XProps = { ... }` directly above it, where `X` is the component name; one or two props may stay inline. Any named, imported or derived props type passes. Enforced by `watchdog/component-props-type` ([`rules.md`](rules.md)).

## Gotchas

- **`react-resizable-panels` v4:** numeric `defaultSize` / `minSize` / `maxSize` are pixels; strings without units are percentages. Use strings like `"34%"`. Panel ids must be unique per group: pass `groupId` to `SplitView`. No `autoSaveId` on the vendor wrapper (DOM warning).
- **`<button>` inside `<button>`:** Base UI `TooltipTrigger` defaults to `<button>`; use `render={<span />}` or `WithTooltip shouldWrapSpan` inside queue row buttons. `CollapsibleTrigger` is also a `<button>`: use `nativeButton={false}` + `render={<div />}` when the header holds copyable `IdChip`s or other buttons (and `stopPropagation` on the inner wrapper). Nothing lints this; it surfaces as a hydration error.
- **Button as Link:** Base UI `Button` + `render={<Link />}` needs `nativeButton={false}`.
- **`scrollbar-gutter: stable`** forces classic scrollbar mode and ignores `::-webkit-scrollbar`; avoid it on styled scroll areas.
- **Theme:** the toggle sets `.dark` / `.light` on `<html>` and toasts inherit the document's CSS variables; don't reintroduce `next-themes` without a provider.
- **Eyebrow, TimelineDot, width token:** the uppercase tracked label is `Eyebrow` (`tone` muted, foreground or inherit; `EYEBROW_CLASS` for a component that only takes `className`, such as `KindBadge`), never a hand-written `tracking-wider uppercase`. `TimelineDot` (`size` `sm` or `md`; the caller passes fill and border colour only) owns the one offset that centres a dot on the `TimelineSpine` line, so each item must be `relative` and a direct child of an `ml-2 pl-4` spine (`ml-2` is the layout margin every timeline uses). A width used in more than one place is a named width (`w-filter-menu`, from `--container-filter-menu` in `wd-theme.css`, mirrored in DESIGN.md `widths`); `check:design-tokens` fails when the two disagree. Nothing flags a new arbitrary width or a hand-written eyebrow (`guidance`).
- **Opaque ids:** never `.slice(0, N)` a hash or id in `domains/`; use `IdChip` / `formatOpaqueId` (`watchdog/no-opaque-id-slice` flags the common form only).
