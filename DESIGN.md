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
typography:
  body:
    fontFamily: Geist Variable
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Geist Variable
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.25
  section-heading:
    fontFamily: Geist Variable
    fontSize: 1rem
    fontWeight: 500
    lineHeight: 1.375
  meta:
    fontFamily: Geist Variable
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.25
  chip:
    fontFamily: Geist Variable
    fontSize: 0.75rem
    fontWeight: 400
    letterSpacing: 0.05em
  mono:
    fontFamily: Geist Mono Variable
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.25
rounded:
  sm: 3px
  md: 6px
  lg: 9px
  full: 9999px
spacing:
  base: 4px
  row-height: 35px
  page-header: 45px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
  popover:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
  chip:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
    typography: "{typography.chip}"
    rounded: "{rounded.full}"
---

# Watchdog

The single home for Watchdog's design direction and taste rules for `apps/web`. Edit a rule here first; the docs under [`docs/reference/web/ui/`](docs/reference/web/ui/README.md) cover mechanics (token plumbing, component APIs, loading, vendoring) and [`rules.md`](docs/reference/web/ui/rules.md) lists what enforces each rule. **The CSS in `apps/web/src/styles/` is the source of truth for values**; if this file and the CSS disagree, the CSS wins and this file is stale. Fix it.

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

## Typography

- Geist Variable for UI, Geist Mono Variable for ids, hashes, paths, timestamps, and counts. Mono carries data, never decoration. Opaque ids render through `IdChip` / `formatOpaqueId` and are never sliced.
- Weights: 400 by default for names, labels, chips, metadata, and table text. 500 for `SectionLabel` headings, column headers, the active nav row, and the brand wordmark; 600 for page, dossier, and settings card headings; dates are 300.
- Vanilla Tailwind scale (`text-xs`, `text-sm`, `text-base`, plus the theme's `text-2xs`). No `text-[Npx]`, no custom type-role classes. Counts use tabular numerals. Inputs stay `text-sm` (iOS zoom floor).
- Self-hosted via Fontsource, not Vercel `geist` or `next/font`.

## Layout

- Panel-first: Queue + Detail splits, tables, stacks. Homogeneous work lists are `divide-y` Queue rows, not Card-per-row. No nested cards, no floating section cards.
- Stable dimensions: nav rows ~35px, page header 45px (44 + border). Headers, rows, and controls do not change size when labels, counts, or loading states change.
- Everything scales from `--wd-display-scale` (rem-based); never hard-code px for type or spacing.
- Below 768px a split shows one column at a time (Queue, then Detail with a back control). Coarse pointers get larger targets; desktop density does not change for them.

## Elevation & Depth

Flat. Cards match the page (`--card` = `--background`); separation comes from borders, alignment, and whitespace, not shadow. The only raised surfaces are popovers, menus, and tooltips (`surface-raised`). Selection is an amber wash (`bg-signal/10`), never a pulse or a side bar; a thin left bar (`bg-status-running`) means state (a live job), not decoration.

## Shapes

A three-step radius ladder: `rounded-sm` (3px, checkbox/tiny inset), `rounded-md` (6px, controls, chips' containers, dialogs, sidebar nav), `rounded-lg` (9px, cards, menus). Nothing is pill-shaped except chips and dots. Banned: `rounded-xl` and up, arbitrary `rounded-[…]`.

## Components

- Primitives are shadcn `base-mira` (Base UI) in `packages/ui`, generated and locked. **Never hand-edit `packages/ui/src/components`**; Watchdog behavior goes in a same-name wrapper under `apps/web/src/shared/ui/primitives/` (only Button, Dialog, AlertDialog, and Combobox have wrappers: import those from the wrapper, everything else from `@watchdog/ui/components/<name>`) or in tokens.
- Hand-owned atoms live in `apps/web/src/shared/ui/` and never fetch, mutate, or route. Domains own I/O.
- Chrome is **Queue + Detail**. Do not introduce Console, Workbench, or Tape surfaces, and never name a screen `*Panel`. Never name a component `Entity` (that word means the graph subject).
- Keyboard first on work surfaces: `j`/`k` move through a Queue, single-key actions (`a` Accept, `r` Reject) sit on the buttons that own them and show their key, Enter confirms dialogs, Mod+K reaches every page and command.
- Writing fields (input, textarea, combobox, rich text) tint the border on focus and add no outer ring; select triggers add a soft 2px ring. Focus chrome lives in `styles/wd-overrides.css`; do not add `focus-visible:ring-*` to primitives.
- Copy says `Couldn't`, `Can't`, `Failed to`. Never `Unable to` or `Oops`.

## Motion

Short and functional, tokens `--duration-fast` (100ms) and `--duration-panel` (180ms).

- High-frequency paths (Queue select, Detail swap) are instant or ≤100ms and color-only. Dialogs and sheets are ≤180ms; menus and popovers keep the vendor ~75-100ms fade.
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
- Nest buttons (`WithTooltip wrapSpan` around a `Button`), or wrap cards in cards.
- Add a skeleton in a domain or route; one pending surface per region ([`loading.md`](docs/reference/web/ui/loading.md)).
- Restyle a vendored primitive in place.
