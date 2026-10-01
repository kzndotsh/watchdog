# UI: tokens and design system

This page defines colors, type scale, the refuse list, and design-system primitives. The hub is [`../UI.md`](../UI.md).

## Design system

- Primitives: shadcn `base-mira` (Base UI) in the `@watchdog/ui` package, generated and locked ([`vendor.md`](vendor.md)); Watchdog wrappers (same-name, only where behavior must apply everywhere) in `src/shared/ui/primitives/`
- Hand-owned atoms: `src/shared/ui/` (`QueueRow`, `SplitView`, data-table kit, etc.)
- Page chrome: `shared/layout/{app-shell,app-sidebar,app-breadcrumbs,page,page-trail,use-page-trail,page-toolbar,page-filter-menu,route-pending,route-error,case-switcher,theme-toggle}`
- Prefer `@/shared/ui/*` (owned) / `@watchdog/ui/components/*` (primitives; `@/shared/ui/primitives/*` where a wrapper exists) over raw HTML
- Theme and palette: see [`/DESIGN.md`](../../../../DESIGN.md#colors); values live in `styles/wd-tokens.css` and `styles/wd-dark.css`
- Font (Fontsource, self-hosted: not Vercel `geist` / Next `next/font`):
  - Sans: **Geist Variable** → `--font-sans` via `@fontsource-variable/geist/wght.css`
  - Mono: **Geist Mono Variable** → `--font-mono` via `@fontsource-variable/geist-mono/wght.css`
  - Family names must match the package `@font-face` strings exactly (`"Geist Variable"` / `"Geist Mono Variable"`).
  - Radius ladder (three steps, [`/DESIGN.md`](../../../../DESIGN.md#shapes)): `--radius: 0.375rem` is the `rounded-md` base. Exceptions: `rounded-full` · `rounded-none` · `rounded-[inherit]`. `--radius-xl..4xl` are capped to `--radius-lg` in `wd-theme.css`; arbitrary `rounded-[min(…)]` / `calc(var(--radius)±Npx)` are banned.
- Mode: **Operate** (consistency over surprise)
- Theme toggle: `.dark` / `.light` on `<html>`; toast surfaces inherit theme tokens
- Display size: `--wd-display-scale` (product default **`1.1` Default**) on `:root`; `html { font-size: calc(100% * var(--wd-display-scale) * var(--wd-viewport-font-factor)); }` scales rem typography + Tailwind spacing. `--wd-viewport-font-factor` is `1.06` on wide hi-DPI viewports (4K). Presets `1.1 | 1.2 | 1.35` in `localStorage['wd-display-scale']`; Settings → Appearance + blocking init in `__root.tsx`. Browser zoom remains available (WCAG 1.4.4).
- Root: `TooltipProvider delay={500}` + `Toaster` (dense hit targets: `WithTooltip` + `wrapSpan`)
- Tooltip chrome: elevated dark tip (`--wd-neutral-800` / `--wd-neutral-50` + light ring) via `TooltipContent`: sits above dark page bg; `Timestamp` / `WithTooltip` / sidebar share it
- `@watchdog/ui` is generated (not linted / formatted); `shared/ui` (atoms + `primitives/` wrappers) is hand-owned and typechecked
- **Field focus ring:** `styles/wd-overrides.css` owns focus chrome. **Select / field triggers:** border `color-mix(--ring 50%)` + 2px outer ring at `color-mix(--ring 30%)`. **Writing fields** (input, textarea, input-group, combobox, rich-text): border tint only @ `color-mix(--ring 45%)` — no outer ring (avoids border + halo double line). Table cells keep quieter 1px overrides. Do not add `focus-visible:ring-3` on writing primitives.
- Base UI: `Button` + `render={<Link … />}` → **`nativeButton={false}`**
- **no-I/O litmus:** `shared/ui` never fetches, mutates, or routes. Domains own I/O.
- Homogeneous work lists → `divide-y` Queue rows (not Card-per-row stacks). Cases are a small set of containers: card grid is OK (`CASE_CARD_SHELL_CLASS` — border on `background`). Dashboard metric tiles are borderless (type + hover fill). Surfaces stay flat: `--card` matches `--background`; `--accent` hover is muted, not cyan. Cyan is **primary / state** only.
- Never name a UI component `Entity`: that word means graph subject; use `QueueRow` / `DossierEditDialog` / domain-prefixed names.

## Overlay primitives

Overlays come from `@watchdog/ui` (upstream Mira look) directly. Dialog and AlertDialog get Enter-to-confirm from their `shared/ui/primitives` wrappers. Domain wrappers compose these primitives; do not fork a third modal stack.

| Primitive | Use when | Watchdog contract |
| --- | --- | --- |
| **Dialog** (`dialog.tsx`) | Create/edit forms, multi-field flows, dismissible overlays (Cases New Case, task form, dossier edit, bulk add) | Upstream Mira surface (`bg-popover` + ring, ladder-capped radius, `p-4` / `gap-4`); default `sm:max-w-sm`, override per surface (e.g. bulk add `max-w-5xl`); Enter confirms |
| **AlertDialog** | Blocking confirm, medium-stakes cancel (`DestructiveConfirmDialog` for irreversible) | Upstream layout; `AlertDialogAction` runs on our Button (`loading`) |
| **Sheet** | Right-side notes / long editors | Upstream slide-over; shares popover palette |
| **Popover** | Filters, compact pickers, table cells | Upstream `p-2.5` (`flush` for calendars / lists); set `modal` when clicks must not pass through rows |
| **Toast** (`shared/ui/toast.tsx`) | Transient mutation OK/fail, copy confirmations | Upstream shadcn Base UI toast + `Toaster` (per-type icons, stacking motion) from `@watchdog/ui`; our file only adds `toast.success` / `error` / `warning` / `info` / `loading` one-call helpers. Mount `<Toaster />` once in the root layout |

**Enter confirms** (`shared/lib/dialog-default-action.ts`, wired into `DialogContent` + `AlertDialogContent`): Enter clicks `[data-dialog-default-action]`, else the AlertDialog action, else the single enabled primary/destructive footer `Button` (`data-variant`). Native Enter wins inside `<form>`, on buttons/links, comboboxes, menus, textareas (Mod+Enter confirms from a textarea), and during IME composition. Two primaries → no default. Opt out with `enterConfirms={false}`. Lives in the `primitives` wrappers, so `pnpm ui:sync` never disturbs it.

Pick **Dialog** over **AlertDialog** when the user may dismiss via backdrop or close, or when the body is a real form. Pick **AlertDialog** when the flow must stay focused until an explicit action.

Bind to **semantic** tokens only. `--wd-*` ramps define those semantics.

| Job | Prefer |
| --- | --- |
| Page | `background` / `foreground` |
| Elevated | `card` |
| Overlay (menus · popovers) | `popover` |
| Modal dialog panel | `card` (Dialog primitive — lifts above `background`; do not use `popover` for centered modals) |
| App nav chrome | `sidebar-*` (don't invent a third panel palette) |
| Action | `primary` |
| Hover/selected | `accent` |
| Helper | `muted` / `muted-foreground` |
| Danger | `destructive` |
| Resting stroke | `border` / `input` (quiet mix: same as field Select chrome) |
| Triage selection | `signal` |
| OK | `success` |
| Caution | `warning` |

Domain meaning: `--confidence-*` / `--status-*` / `--kind-*` only. Never freestyle `text-green-600` / `text-amber-400` for those meanings (`@shadcn/lint` `no-raw-colors` fails it). Badges are **meaning-named** (`ConfidenceBadge`), never color-named (`variant="purple"`).

Contrast fix: adjust OKLCH **L only**: keep hue/chroma stable.

## Refuse list

The list itself is in [`/DESIGN.md`](../../../../DESIGN.md#dos-and-donts). Enforcement: `ds:check` covers gradients, glass, and `rounded-xl+`; `@shadcn/lint` covers raw palette hues; the rest is review. Why each rule exists: [`rules.md`](rules.md).

## Type scale (hybrid)

**Tailwind `@theme`** (`styles/wd-theme.css`) owns rem sizes: `text-2xs` (0.8125rem), `text-xs`, `text-sm`, `text-base`, `text-xl`, `text-2xl`. Default Tailwind steps already match ops-dense body/page sizes; **`text-2xs`** fills the 13px gap between xs (12) and sm (14).

**No type roles.** Use vanilla Tailwind (`text-*`, `font-*`, `leading-*`, `tracking-*`, `font-mono`, `uppercase`); the vendored primitives and stock `cn` speak the same classes. Recipes the app repeats (the `/ui` specimen lists them):

| Use | Classes |
| --- | --- |
| Dossier heading | `text-2xl font-semibold leading-tight tracking-tight` |
| Page heading | `text-xl font-semibold leading-tight tracking-tight` |
| Section heading | `text-base font-medium leading-snug` |
| Body / secondary body | `text-base leading-normal` / `text-sm leading-normal` |
| Label | `text-sm leading-tight` |
| Meta label / compact meta label | `text-2xs` / `text-xs leading-tight` |
| Mono value / compact mono (ids, timestamps) | `font-mono text-sm leading-tight` / `font-mono text-2xs` |
| Chip | `text-xs tracking-wider uppercase` |

**Weights:** 400 is the default for everything (names, labels, chips, metadata, table text). 500 (`font-medium`) is only for section headings, column headers and the active nav row; 600 for page and dossier headings. Dates use `font-light` (300).

`@shadcn/lint` `no-arbitrary-values` bans `text-[Npx]` / `text-[Nrem]` (and other off-scale values: use a theme token or add one, e.g. `tracking-eyebrow`); escape with `// oxlint-disable-next-line shadcn/no-arbitrary-values -- reason`. **Input** uses `text-sm` (iOS zoom floor).
