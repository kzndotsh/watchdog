# UI — tokens and design system

**What this is:** colors, type roles, refuse list, design-system primitives.  
**Hub:** [`../UI.md`](../UI.md) (redirects here after split).

## Design system

- Primitives: shadcn (Base UI / `base-nova`) in `src/shared/ui/shadcn/` (registry / `@ts-nocheck`)
- Hand-owned atoms: `src/shared/ui/` (`QueueRow`, `SplitView`, data-table kit, …)
- Page chrome: `shared/layout/{app-shell,app-sidebar,app-breadcrumbs,page,page-trail,use-page-trail,page-toolbar,page-filter-menu,route-pending,route-error,case-switcher,theme-toggle}`
- Prefer `@/shared/ui/*` (owned) / `@/shared/ui/shadcn/*` (primitives) over raw HTML
- Theme: OKLCH cool neutrals (~250) + **steel-cyan** accent (~220) + **amber** signal (~75); **no violet brand**
- Font (Fontsource, self-hosted — not Vercel `geist` / Next `next/font`):
  - Sans: **Geist Variable** → `--font-sans` via `@fontsource-variable/geist/wght.css`
  - Mono: **Geist Mono Variable** → `--font-mono` via `@fontsource-variable/geist-mono/wght.css`
  - Family names must match the package `@font-face` strings exactly (`"Geist Variable"` / `"Geist Mono Variable"`).
  - Radius ladder (only three + exceptions):
    - **`--radius: 0.5rem`** = medium base (**8px**) — default via `rounded-md`
    - `rounded-sm` (4px) — checkbox / tiny inset
    - `rounded-md` (8px) — controls, chips, dense panels
    - `rounded-lg` (12px) — cards, dialogs, menus, larger surfaces
    - Exceptions: `rounded-full` · `rounded-none` · `rounded-[inherit]`
    - Ban `rounded-xl` / `2xl` / `3xl` / `4xl` and arbitrary `rounded-[min(…)]` / `calc(var(--radius)±Npx)`
- Mode: **Operate** (consistency over surprise)
- Theme toggle: `.dark` / `.light` on `<html>`; Sonner follows that class
- Root: `TooltipProvider delay={500}` + `Toaster` (dense hit targets: `WithTooltip` + `wrapSpan`)
- Tooltip chrome: elevated dark tip (`--wd-neutral-800` / `--wd-neutral-50` + light ring) via `TooltipContent` — sits above dark page bg; `Timestamp` / `WithTooltip` / sidebar share it
- shadcn folder excluded from typecheck; hand-owned `shared/ui` typechecked by default
- Base UI: `Button` + `render={<Link … />}` → **`nativeButton={false}`**
- **no-I/O litmus:** `shared/ui` never fetches, mutates, or routes. Domains own I/O.
- Homogeneous work lists → `divide-y` Queue rows (not Card-per-row stacks). Cases are a small set of containers — card grid is OK (`ACCENT_CARD_SURFACE`).
- Never name a UI component `Entity` — that word means graph subject; use `QueueRow` / `DossierEditDialog` / domain-prefixed names.

## Color tokens

Bind to **semantic** tokens only. `--wd-*` ramps define those semantics.

| Job | Prefer |
| --- | --- |
| Page | `background` / `foreground` |
| Elevated | `card` |
| Overlay | `popover` |
| App nav chrome | `sidebar-*` (don’t invent a third panel palette) |
| Action | `primary` |
| Hover/selected | `accent` |
| Helper | `muted` / `muted-foreground` |
| Danger | `destructive` |
| Resting stroke | `border` / `input` (quiet mix — same as field Select chrome) |
| Triage selection | `signal` |
| OK | `success` |
| Caution | `warning` |

Domain meaning: `--confidence-*` / `--status-*` / `--severity-*` / `--kind-*` only. Never freestyle `text-green-600` / `text-amber-400` for those meanings. Badges are **meaning-named** (`ConfidenceBadge`), never color-named (`variant="purple"`).

Contrast fix: adjust OKLCH **L only** — keep hue/chroma stable.

## Refuse list (AI slop)

No nested cards, colored side-tab accents, glow/halo, gradient text, icon-tile feature grids, bounce/elastic easing, decorative glass, mono-as-decoration, cream/violet brand defaults.

## Type roles

`text-heading-page|dossier|section`, `text-label` / `text-label-sm` / `text-label-meta` / `text-label-meta-sm`, `text-label-mono` / `text-label-mono-sm` (Geist Mono via `--font-mono`), `text-copy` / `text-copy-sm`, `text-chip` (uppercase chips only). Ban new `text-[10px]` / `text-[11px]` outside `styles.css`. Mono = IDs/hashes/paths/capability ids. Register new roles in `lib/utils.ts` for twMerge.
