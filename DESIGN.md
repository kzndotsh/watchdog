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
  light-muted-foreground: "oklch(0.52 0.02 250)"
  light-surface-raised: "oklch(1 0.002 250)"
  light-primary: "oklch(0.48 0.11 220)"
  light-on-primary: "oklch(0.98 0.01 220)"
  light-ring: "oklch(0.6 0.12 220)"
  light-signal: "oklch(0.52 0.14 75)"
  light-success: "oklch(0.52 0.13 155)"
  light-destructive: "oklch(0.55 0.2 25)"
typography:
  # Vanilla Tailwind scale; sizes are rem, so they scale with --wd-display-scale. Families: --font-sans / --font-mono in wd-theme.css. text-2xs (0.8125rem) is the theme's own step.
  dossier-heading:
    fontFamily: Geist Variable
    fontSize: 1.5rem
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.025em
  page-heading:
    fontFamily: Geist Variable
    fontSize: 1.25rem
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.025em
  section-heading:
    fontFamily: Geist Variable
    fontSize: 1rem
    fontWeight: 500
    lineHeight: 1.375
  body-md:
    fontFamily: Geist Variable
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: Geist Variable
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Geist Variable
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.25
  meta-label:
    fontFamily: Geist Variable
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.25
  meta-label-sm:
    fontFamily: Geist Variable
    fontSize: 0.75rem
    fontWeight: 400
    lineHeight: 1.25
  mono-value:
    fontFamily: Geist Mono Variable
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.25
  mono-value-sm:
    fontFamily: Geist Mono Variable
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1.25
  chip:
    fontFamily: Geist Variable
    fontSize: 0.8125rem
    fontWeight: 400
    lineHeight: 1
rounded:
  # --radius-* in wd-theme.css: calc() of --radius (0.375rem) in wd-tokens.css. full is Tailwind's rounded-full.
  sm: 0.1875rem
  md: 0.375rem
  lg: 0.5625rem
  full: 9999px
omitted:
  - section: spacing
    reason: "Tailwind's 0.25rem spacing scale, scaled by --wd-display-scale; no custom steps, so there is no CSS source to mirror"
components:
  # Colour pairs the UI renders, so the linter's contrast-ratio rule checks them (a *-mark has a fill and no text pair). Dark first, then the light-* equivalents. Light text on `muted` (`light-text-on-muted`), `text-signal` and `text-success` are included: their light tokens were darkened to pass AA (see Colors).
  surface:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
  text-muted:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted-foreground}"
  muted-surface:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
  popover:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
  text-primary:
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
  text-signal:
    backgroundColor: "{colors.background}"
    textColor: "{colors.signal}"
  text-success:
    backgroundColor: "{colors.background}"
    textColor: "{colors.success}"
  text-destructive:
    backgroundColor: "{colors.background}"
    textColor: "{colors.destructive}"
  signal-mark:
    backgroundColor: "{colors.signal}"
  success-mark:
    backgroundColor: "{colors.success}"
  focus-ring:
    backgroundColor: "{colors.ring}"
    size: 2px
  light-surface:
    backgroundColor: "{colors.light-background}"
    textColor: "{colors.light-foreground}"
  light-text-muted:
    backgroundColor: "{colors.light-background}"
    textColor: "{colors.light-muted-foreground}"
  light-muted-surface:
    backgroundColor: "{colors.light-muted}"
    textColor: "{colors.light-foreground}"
  light-popover:
    backgroundColor: "{colors.light-surface-raised}"
    textColor: "{colors.light-foreground}"
    rounded: "{rounded.lg}"
  light-button-primary:
    backgroundColor: "{colors.light-primary}"
    textColor: "{colors.light-on-primary}"
    rounded: "{rounded.md}"
  light-text-primary:
    backgroundColor: "{colors.light-background}"
    textColor: "{colors.light-primary}"
  light-signal-mark:
    backgroundColor: "{colors.light-signal}"
  light-success-mark:
    backgroundColor: "{colors.light-success}"
  light-text-on-muted:
    backgroundColor: "{colors.light-muted}"
    textColor: "{colors.light-muted-foreground}"
  light-text-signal:
    backgroundColor: "{colors.light-background}"
    textColor: "{colors.light-signal}"
  light-text-success:
    backgroundColor: "{colors.light-background}"
    textColor: "{colors.light-success}"
  light-text-destructive:
    backgroundColor: "{colors.light-background}"
    textColor: "{colors.light-destructive}"
  light-focus-ring:
    backgroundColor: "{colors.light-ring}"
    size: 2px
  chip:
    typography: "{typography.chip}"
    rounded: "{rounded.md}"
---

# Watchdog

The single home for Watchdog's design direction and taste rules for `apps/web`. Edit a rule here first. [`rules.md`](docs/reference/web/ui/rules.md) lists what enforces each rule; the other docs under [`docs/reference/web/ui/`](docs/reference/web/ui/README.md) cover mechanics (loading, atoms, vendoring). **The CSS in `apps/web/src/styles/` is the source of truth for values**; if this file and the CSS disagree, the CSS wins and this file is stale. The front matter follows the [DESIGN.md format](https://github.com/google-labs-code/design.md) (version `alpha`) and `pnpm lint:design` runs the official linter over it, failing on any error or warning. `pnpm check:design-tokens` checks the values that have a CSS source against the CSS: every `colors` token (`wd-tokens.css` light and ramps, `wd-dark.css` dark), `rounded.sm` / `md` / `lg` (`wd-theme.css`), every `typography` `fontFamily`, and the `text-2xs` size and line height. Type sizes, weights and line heights from the Tailwind scale, `rounded.full` and the component colour pairs have no CSS source to compare, so they are not value-checked (the linter checks the pairs' contrast). Everything below the front matter is prose.

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
- Key palettes and their front-matter tokens. Dark: neutrals `background`, `foreground`, `surface-raised` (popovers, menus, tooltips), `muted`, `muted-foreground`; accent `primary` with `on-primary` and `ring`; signal `signal`; status `success` and `destructive`. Light: the same roles as `light-*` (`light-background`, `light-foreground`, `light-surface-raised`, `light-muted`, `light-muted-foreground`, `light-primary`, `light-on-primary`, `light-ring`, `light-signal`, `light-success`, `light-destructive`). The `--wd-*` ramps, `card`, `border` and the domain `-fg` / `-bg` tokens stay in CSS only.
- Contrast is linted for the pairs in `components` (`surface`, `text-muted`, `popover`, `button-primary`, `text-primary`, `text-signal`, `text-success`, `text-destructive`, and their `light-*` twins). Every text pair is AA. Three light tokens were darkened by L only (hue and chroma kept) to get there: `light-signal` 0.72 to 0.52 (2.43:1 to 5.38:1 on `light-background`), `light-success` 0.55 to 0.52 (4.37:1 to 4.95:1) and `light-muted-foreground` 0.55 to 0.52 (4.31:1 to 4.90:1 on `light-muted`, 4.64:1 to 5.27:1 on `light-background`). `light-signal` is also the selection wash and fill, which stays amber and reads a little stronger. Dark is unchanged. `apps/web/src/styles/__tests__/contrast.test.ts` asserts the ratios from the CSS.
- Bind to semantic tokens (`background`, `card`, `popover`, `primary`, `accent`, `muted`, `destructive`, `border`/`input`, `sidebar-*`), not the `--wd-*` ramps. Modal dialog panels use `card`; menus and popovers use `popover`; Triage selection uses `signal`.

## Typography

- Geist Variable for UI, Geist Mono Variable for ids, hashes, paths, timestamps, and counts. Mono carries data, never decoration. Opaque ids render through `IdChip` / `formatOpaqueId` and are never sliced. Self-hosted via Fontsource, not Vercel `geist` or `next/font`.
- Vanilla Tailwind scale (`text-xs`, `text-sm`, `text-base`, plus the theme's `text-2xs` = 0.8125rem). No `text-[Npx]`, no custom type-role classes. Counts use tabular numerals. Inputs stay `text-sm` (iOS zoom floor).
- Weights: 400 by default for names, labels, chips, metadata, and table text. 500 for `SectionLabel` headings, column headers, the active nav row, and the brand wordmark; 600 for page, dossier, and settings card headings; dates are 300.

Sizes are rem, so every size here scales with `--wd-display-scale` (the `typography` tokens hold the rem value at scale 1.0; at the default 1.1 the root is 17.6px). Line heights are the unitless value of the `leading-*` class in the recipe. Recipes the app repeats (the `/ui` specimen page lists them), with the `typography` token for each:

| Use | Classes | Token |
| --- | --- | --- |
| Dossier heading | `text-2xl font-semibold leading-tight tracking-tight` | `dossier-heading` |
| Page heading | `text-xl font-semibold leading-tight tracking-tight` | `page-heading` |
| Section heading | `text-base font-medium leading-snug` | `section-heading` |
| Body / secondary body | `text-base leading-normal` / `text-sm leading-normal` | `body-md` / `body-sm` |
| Label | `text-sm leading-tight` | `label` |
| Meta label / compact meta label | `text-2xs` / `text-xs leading-tight` | `meta-label` / `meta-label-sm` |
| Mono value / compact mono | `font-mono text-sm leading-tight` / `font-mono text-2xs` | `mono-value` / `mono-value-sm` |
| Chip | `text-2xs font-normal leading-none` (`CHIP_SIZE_CLASS`) | `chip` |

## Layout

- Panel-first: Queue + Detail splits, tables, stacks. Homogeneous work lists are `divide-y` Queue rows, not Card-per-row. No nested cards, no floating section cards. Cases are a small set of containers, so a card grid is fine there.
- Stable dimensions: headers, rows, and controls do not change size when labels, counts, or loading states change. (At the default display scale of 1.1 the page header is 45px and nav rows ~35px; those are outputs of the scale, not constants.)
- Spacing is Tailwind's 0.25rem scale with no custom steps, so the front matter omits `spacing` with a reason instead of copying it.
- Everything scales from `--wd-display-scale` (rem-based, presets 1.1 / 1.2 / 1.35 in Settings → Appearance); never hard-code px for type or spacing.
- Below 768px a split shows one column at a time (Queue, then Detail with a back control). Coarse pointers get larger targets; desktop density does not change for them.

## Elevation & Depth

Flat. Cards match the page (`--card` = `--background`); separation comes from borders, alignment, and whitespace, not shadow. The only raised surfaces are popovers, menus, and tooltips (`surface-raised`). Selection is an amber wash (`bg-signal/10`), never a pulse or a side bar; a thin left bar (`bg-status-running`) means state (a live job), not decoration.

## Shapes

A three-step radius ladder: `rounded-sm` (3px, checkbox/tiny inset), `rounded-md` (6px, controls, dialogs, sidebar nav, chips), `rounded-lg` (9px, cards, menus). The px figures are at display scale 1.0; the `rounded` tokens hold the rem values (`0.1875rem`, `0.375rem`, `0.5625rem`), which are `--radius-sm` = 0.5 x `--radius`, `--radius-md` = `--radius` and `--radius-lg` = 1.5 x `--radius`, with `--radius` = 0.375rem in `wd-tokens.css`. `rounded.full` is Tailwind's 9999px. Dots and avatars may be `rounded-full`; nothing else is pill-shaped. `--radius-xl..4xl` are capped to `--radius-lg` in `wd-theme.css`, so `rounded-xl` and up cannot render larger; arbitrary `rounded-[...]` is banned.

## Components

- Primitives are shadcn `base-mira` (Base UI) in `packages/ui`, generated and locked ([`vendor.md`](docs/reference/web/ui/vendor.md)). Watchdog behavior goes in a same-name wrapper under `apps/web/src/shared/ui/primitives/` or in tokens; never restyle a primitive at the call site.
- **Button height comes from `size`, never from `className`:** `xs` h-5, `sm` h-6, default h-7, `lg` h-8, square `icon-xs` / `icon-sm` / `icon` / `icon-lg`, and `inline` for a text link in running text. Same-role buttons are the same height across Triage, Collect and Dossier. If no size fits, add one to the wrapper; lint fails `h-*` on a Button.
- Repeated small pieces are primitives, not copied classes: `Eyebrow` (uppercase tracked label), `TimelineDot` (timeline marker with one offset on a `TimelineSpine` that is always `ml-2 pl-4`: `ml-2` is the layout margin every timeline uses, `pl-4` is the spine padding the dot offset assumes), and named widths (a `--container-<name>` theme variable in `wd-theme.css`, used as `w-<name>`).
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
- Nest buttons (`WithTooltip shouldWrapSpan` around a `Button`).
- Add a skeleton in a domain or route; one pending surface per region ([`loading.md`](docs/reference/web/ui/loading.md)).
- Restyle a vendored primitive in place.
