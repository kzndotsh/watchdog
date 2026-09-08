# UI: tokens and design system

This page defines colors, type roles, the refuse list, and design-system primitives. The hub is [`../UI.md`](../UI.md).

## Design system

- Primitives: shadcn (Base UI / `base-nova`) in `src/shared/ui/shadcn/` (registry / `@ts-nocheck`)
- Hand-owned atoms: `src/shared/ui/` (`QueueRow`, `SplitView`, data-table kit, etc.)
- Page chrome: `shared/layout/{app-shell,app-sidebar,app-breadcrumbs,page,page-trail,use-page-trail,page-toolbar,page-filter-menu,route-pending,route-error,case-switcher,theme-toggle}`
- Prefer `@/shared/ui/*` (owned) / `@/shared/ui/shadcn/*` (primitives) over raw HTML
- Theme: OKLCH cool neutrals (~250), **steel-cyan** accent (~220), and **amber** signal (~75). **No violet brand.**
- Font (Fontsource, self-hosted: not Vercel `geist` / Next `next/font`):
  - Sans: **Geist Variable** → `--font-sans` via `@fontsource-variable/geist/wght.css`
  - Mono: **Geist Mono Variable** → `--font-mono` via `@fontsource-variable/geist-mono/wght.css`
  - Family names must match the package `@font-face` strings exactly (`"Geist Variable"` / `"Geist Mono Variable"`).
  - Radius ladder (only three + exceptions):
    - **`--radius: 0.5rem`** = medium base (**8px**): default via `rounded-md`
    - `rounded-sm` (4px): checkbox / tiny inset
    - `rounded-md` (8px): controls, chips, dense panels, **dialogs**
    - `rounded-lg` (12px): cards, menus, larger surfaces
    - Exceptions: `rounded-full` · `rounded-none` · `rounded-[inherit]`
    - Ban `rounded-xl` / `2xl` / `3xl` / `4xl` and arbitrary `rounded-[min(…)]` / `calc(var(--radius)±Npx)`
- Mode: **Operate** (consistency over surprise)
- Theme toggle: `.dark` / `.light` on `<html>`; Sonner follows that class
- Root: `TooltipProvider delay={500}` + `Toaster` (dense hit targets: `WithTooltip` + `wrapSpan`)
- Tooltip chrome: elevated dark tip (`--wd-neutral-800` / `--wd-neutral-50` + light ring) via `TooltipContent`: sits above dark page bg; `Timestamp` / `WithTooltip` / sidebar share it
- shadcn folder excluded from typecheck; hand-owned `shared/ui` typechecked by default
- **Field focus ring:** `styles/wd-overrides.css` owns focus chrome. **Select / field triggers:** border `color-mix(--ring 50%)` + 2px outer ring at `color-mix(--ring 30%)`. **Writing fields** (input, textarea, input-group, combobox, rich-text): border tint only @ `color-mix(--ring 45%)` — no outer ring (avoids border + halo double line). Table cells keep quieter 1px overrides. Do not add `focus-visible:ring-3` on writing primitives.
- Base UI: `Button` + `render={<Link … />}` → **`nativeButton={false}`**
- **no-I/O litmus:** `shared/ui` never fetches, mutates, or routes. Domains own I/O.
- Homogeneous work lists → `divide-y` Queue rows (not Card-per-row stacks). Cases are a small set of containers: card grid is OK (`CASE_CARD_SHELL_CLASS` — border on `background`, same as dashboard metric tiles).
- Never name a UI component `Entity`: that word means graph subject; use `QueueRow` / `DossierEditDialog` / domain-prefixed names.

## Overlay primitives

Vendored shadcn overlays live in `shared/ui/shadcn/`. **Dialog** is Watchdog-customized (not stock shadcn). Domain wrappers compose these primitives; do not fork a third modal stack.

| Primitive | Use when | Watchdog contract |
| --- | --- | --- |
| **Dialog** (`dialog.tsx`) | Create/edit forms, multi-field flows, dismissible overlays (Cases New Case, task form, dossier edit, bulk add) | `rounded-md`; `bg-card` + `border-border` + `shadow-lg` (not `popover` + ring); scrim `bg-background/75`; dense `p-3` / `gap-3`; title `text-heading-section`; description `text-copy-sm`; header `gap-1 pr-7` (close inset); footer plain `flex` + `gap-1.5` — **sm** buttons (`h-7` / `text-xs`), **no** full-width `border-t` chrome bar; motion `duration-(--duration-panel)`; default `sm:max-w-md` (override per surface, e.g. bulk add `max-w-5xl`) |
| **AlertDialog** | Blocking confirm, medium-stakes cancel (`DestructiveConfirmDialog` for irreversible) | Stock shadcn layout (footer chrome bar retained) |
| **Sheet** | Right-side notes / long editors | Slide-over; shares popover palette |
| **Popover** | Filters, compact pickers, table cells | Dense `p-2.5`; set `modal` when clicks must not pass through rows |

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

Domain meaning: `--confidence-*` / `--status-*` / `--severity-*` / `--kind-*` only. Never freestyle `text-green-600` / `text-amber-400` for those meanings. Badges are **meaning-named** (`ConfidenceBadge`), never color-named (`variant="purple"`).

Contrast fix: adjust OKLCH **L only**: keep hue/chroma stable.

## Refuse list (AI slop)

No nested cards, colored side-tab accents, glow/halo, gradient text, icon-tile feature grids, bounce/elastic easing, decorative glass, mono-as-decoration, cream/violet brand defaults.

## Type roles

`text-heading-page|dossier|section`, `text-label` / `text-label-sm` / `text-label-meta` / `text-label-meta-sm`, `text-label-mono` / `text-label-mono-sm` (Geist Mono via `--font-mono`), `text-copy` / `text-copy-sm`, `text-chip` (uppercase chips only). Ban new `text-[10px]` / `text-[11px]` outside `styles.css`. Mono = IDs/hashes/paths/capability ids. Register new roles in `lib/utils.ts` for twMerge.
