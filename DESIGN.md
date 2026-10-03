---
version: alpha
name: Watchdog
description: Dense, quiet, exact operator UI for long OSINT investigation sessions. Dark-first, flat surfaces, one cyan accent, one amber signal.
colors:
  # Dark theme (primary scene). Source of truth: apps/web/src/styles/wd-dark.css
  background: "oklch(0.19 0.012 250)"
  foreground: "oklch(0.96 0.01 250)"
  surface-raised: "oklch(0.23 0.012 250)"
  muted: "oklch(0.26 0.014 250)"
  muted-foreground: "oklch(0.68 0.02 250)"
  primary: "oklch(0.72 0.12 220)"
  on-primary: "oklch(0.18 0.02 250)"
  ring: "oklch(0.68 0.11 220)"
  signal: "oklch(0.78 0.14 75)"
  success: "oklch(0.76 0.13 155)"
  destructive: "oklch(0.76 0.16 25)"
  # Light theme. Source of truth: apps/web/src/styles/wd-tokens.css
  light-background: "oklch(0.985 0.004 250)"
  light-foreground: "oklch(0.14 0.01 250)"
  light-muted: "oklch(0.96 0.006 250)"
  light-muted-foreground: "oklch(0.55 0.02 250)"
  light-primary: "oklch(0.48 0.11 220)"
  light-signal: "oklch(0.72 0.14 75)"
  light-success: "oklch(0.55 0.13 155)"
  light-destructive: "oklch(0.55 0.2 25)"
---

# Watchdog

The single home for Watchdog's design direction and taste rules for `apps/web`. Edit a rule here first. [`rules.md`](docs/reference/web/ui/rules.md) lists what enforces each rule; the other docs under [`docs/reference/web/ui/`](docs/reference/web/ui/README.md) cover mechanics (loading, atoms, vendoring). **The CSS in `apps/web/src/styles/` is the source of truth for values**; if this file and the CSS disagree, the CSS wins and this file is stale. Only the `colors` front matter is checked (`pnpm check:design-tokens` syncs it to `wd-tokens.css` and `wd-dark.css`); everything below is prose and is not checked.

## Overview

Watchdog is an operator's tool for long investigation sessions: **dense, quiet, and exact**. An investigator keeps their place across Queue, Detail, Dossier, and Graph without the chrome competing with the evidence. Orientation first (which Case, which row, what state), then the one command that matters in that scope.

Anti-references: generic SaaS dashboards, decorative AI gradients and glow, terminal cosplay, card-per-row stacks.

## Colors

- OKLCH everywhere. Neutrals are lightly tinted cool (hue ~250), never pure gray. Dark mode is charcoal, not black.
- **One accent:** steel-cyan (hue ~220) for primary actions, focus, and live state. **One signal:** amber (hue ~75) for selection and "needs you". No violet brand.
- Status and domain meaning come from tokens (`--status-*`, `--confidence-*`, `--kind-*`), never raw palette classes. Each has a `-fg` and `-bg` variant.
- **Status is never color-only.** Every status has its own glyph shape; color reinforces it.
- Hover on `--accent` is muted, not cyan. Cyan means primary or state, nothing else.
- Contrast fixes change OKLCH **L only**; keep hue and chroma stable.
- Bind to semantic tokens (`background`, `card`, `popover`, `primary`, `accent`, `muted`, `destructive`, `border`/`input`, `sidebar-*`), not the `--wd-*` ramps. Modal dialog panels use `card`; menus and popovers use `popover`; Triage selection uses `signal`.

## Typography

- Geist Variable for UI, Geist Mono Variable for ids, hashes, paths, timestamps, and counts. Mono carries data, never decoration. Opaque ids render through `IdChip` / `formatOpaqueId` and are never sliced. Self-hosted via Fontsource, not Vercel `geist` or `next/font`.
- Vanilla Tailwind scale (`text-xs`, `text-sm`, `text-base`, plus the theme's `text-2xs` = 0.8125rem). No `text-[Npx]`, no custom type-role classes. Counts use tabular numerals. Inputs stay `text-sm` (iOS zoom floor).
- Weights: 400 by default for names, labels, chips, metadata, and table text. 500 for `SectionLabel` headings, column headers, the active nav row, and the brand wordmark; 600 for page, dossier, and settings card headings; dates are 300.

Recipes the app repeats (the `/ui` specimen page lists them):

| Use | Classes |
| --- | --- |
| Dossier heading | `text-2xl font-semibold leading-tight tracking-tight` |
| Page heading | `text-xl font-semibold leading-tight tracking-tight` |
| Section heading | `text-base font-medium leading-snug` |
| Body / secondary body | `text-base leading-normal` / `text-sm leading-normal` |
| Label | `text-sm leading-tight` |
| Meta label / compact meta label | `text-2xs` / `text-xs leading-tight` |
| Mono value / compact mono | `font-mono text-sm leading-tight` / `font-mono text-2xs` |
| Chip | `text-2xs font-normal leading-none` (`CHIP_SIZE_CLASS`) |

## Layout

- Panel-first: Queue + Detail splits, tables, stacks. Homogeneous work lists are `divide-y` Queue rows, not Card-per-row. No nested cards, no floating section cards. Cases are a small set of containers, so a card grid is fine there.
- Stable dimensions: headers, rows, and controls do not change size when labels, counts, or loading states change. (At the default display scale of 1.1 the page header is 45px and nav rows ~35px; those are outputs of the scale, not constants.)
- Everything scales from `--wd-display-scale` (rem-based, presets 1.1 / 1.2 / 1.35 in Settings → Appearance); never hard-code px for type or spacing.
- Below 768px a split shows one column at a time (Queue, then Detail with a back control). Coarse pointers get larger targets; desktop density does not change for them.

## Elevation & Depth

Flat. Cards match the page (`--card` = `--background`); separation comes from borders, alignment, and whitespace, not shadow. The only raised surfaces are popovers, menus, and tooltips (`surface-raised`). Selection is an amber wash (`bg-signal/10`), never a pulse or a side bar; a thin left bar (`bg-status-running`) means state (a live job), not decoration.

## Shapes

A three-step radius ladder: `rounded-sm` (3px, checkbox/tiny inset), `rounded-md` (6px, controls, dialogs, sidebar nav, chips), `rounded-lg` (9px, cards, menus). Dots and avatars may be `rounded-full`; nothing else is pill-shaped. `--radius-xl..4xl` are capped to `--radius-lg` in `wd-theme.css`, so `rounded-xl` and up cannot render larger; arbitrary `rounded-[...]` is banned.

## Components

- Primitives are shadcn `base-mira` (Base UI) in `packages/ui`, generated and locked ([`vendor.md`](docs/reference/web/ui/vendor.md)). Watchdog behavior goes in a same-name wrapper under `apps/web/src/shared/ui/primitives/` or in tokens; never restyle a primitive at the call site.
- Hand-owned atoms live in `apps/web/src/shared/ui/` and never fetch, mutate, or route. Domains own I/O.
- Chrome is **Queue + Detail**. Do not introduce Console, Workbench, or Tape surfaces, and never name a screen `*Panel`. Never name a component `Entity` (that word means the graph subject).
- Keyboard first on work surfaces: `j`/`k` move through a Queue, single-key actions (`a` Accept, `r` Reject) sit on the buttons that own them and show their key, Enter confirms dialogs, Mod+K reaches every page and command.
- Writing fields (input, textarea, combobox, rich text) tint the border on focus and add no outer ring; select triggers add a soft 2px ring. Focus chrome lives in `styles/wd-overrides.css`; do not add `focus-visible:ring-*` to primitives.
- Scrollbars are owned by `wd-overrides.css` (6px rail, faint thumb); do not set scrollbar widths or colors per component.
- **Dialog vs AlertDialog:** Dialog for forms and anything the user may dismiss by backdrop or close; AlertDialog when the flow must stay focused until an explicit action. Enter confirms the default action in both (`shared/lib/dialog-default-action.ts`, wired into the `primitives` wrappers): it clicks `[data-dialog-default-action]`, else the AlertDialog action, else the single enabled primary or destructive footer button. Native Enter wins inside forms, on buttons, comboboxes, menus, and textareas (Mod+Enter confirms from a textarea); opt out with `enterConfirms={false}`.

## Motion

Short and functional, tokens `--duration-fast` (100ms) and `--duration-panel` (180ms).

- High-frequency paths (Queue select, Detail swap) are instant or at most 100ms and color-only. Dialogs and sheets are at most 180ms; menus and popovers keep the vendor ~75-100ms fade.
- No page-mount fades, staggered or blur entrances, or AnimatePresence on Queue/Detail. Button press is the vendor 1px `translate-y`; no scale, bounce, or elastic easing.
- The only continuous motion is the skeleton pulse and the running-status spin. Reduced motion stops both and loses no meaning.

## Do's and Don'ts

**Do**

- Use semantic tokens and the shadcn/Tailwind scale; add a theme token rather than an arbitrary value.
- Put loading, empty, and error states in the same footprint as the content they replace.
- Give every icon-only control an accessible name and every focusable thing a visible focus ring.
- Verify both themes. WCAG 2.2 AA in light and dark.

**Don't**

- Use raw palette colors, gradients, glows, or decorative blur.
- Rely on color alone to carry status.
- Use nested cards, glow or halo, gradient text, icon-tile feature grids, decorative colored side borders, decorative glass, mono as decoration, or cream/violet brand defaults.
- Nest buttons (`WithTooltip wrapSpan` around a `Button`).
- Add a skeleton in a domain or route; one pending surface per region ([`loading.md`](docs/reference/web/ui/loading.md)).
- Restyle a vendored primitive in place.
