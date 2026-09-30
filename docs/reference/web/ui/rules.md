# UI: rules inventory

This page lists every web UI rule, what it prevents, and whether it is kept. The design intent behind the taste rules is [`../../../explanation/design.md`](../../../explanation/design.md). Last audited 2026-09-29.

**Kinds.** **Correctness** rules stop a bug class: keep unless the bug can no longer happen. **Consistency** rules keep one way to do a thing: cheap, keep while they cost nothing. **Taste** rules are design opinions: they live in the brief and change when the brief changes.

**Enforced by:** `ds` = `pnpm --filter @watchdog/web ds:check` · `lint` = oxlint (incl. `@shadcn/lint`) · `test` = unit/component test · `review` = PR checklist only.

## Correctness

| Rule | Prevents | Verdict | Enforced by |
| --- | --- | --- | --- |
| Opaque ids via `IdChip` / `formatOpaqueId`, never `.slice(0,N)` | Truncated ids that collide and can't be searched | Keep | ds |
| No fictional vocab (`probable`, `active`, `dormant`, `merged`) | UI values that aren't in `@watchdog/schemas` unions | Keep | ds |
| Loaders await identity only; no `await Promise.all` in loaders | SSR TTFB waterfalls | Keep | ds |
| ≤1 `useSuspenseQuery` per file (`useSuspenseQueries` instead) | Serial suspense waterfalls on cold cache | Keep | ds |
| No `RoutePending` in routes (one pending surface per region) | Double skeletons: route pending + in-page pending | Keep | ds |
| `aria-busy` / `animate-pulse` only inside `shared/ui` | Loading regions without the three a11y channels or the reduced-motion guard | Keep | ds |
| The sixteen loading rules ([`loading.md`](loading.md)) | Flashing skeletons, confident wrong values, blanked shells | Keep | ds (partial) + review |
| No `@watchdog/policy` barrel / `@watchdog/core` root in client code | Effect, db, blob pulled into the browser bundle | Keep | review |
| Web never imports `@watchdog/db` (except auth + SSE) | Bypassing oRPC → core → repos | Keep | lint |
| One QueryClient per router, never a singleton | Cross-request cache bleed in SSR | Keep | review |
| `<Navigate>` as a sibling, never an early return | Skeleton → blank → content flicker on cold load | Keep | review |
| Base UI `Button` + `render={<Link/>}` sets `nativeButton={false}` | Nested interactive elements, wrong semantics | Keep | review |
| No `<button>` in `<button>` (`WithTooltip wrapSpan`) | Invalid DOM, hydration errors | Keep | review |
| `DataTable`: every column sets `size` | Leftover width dumped on one column | Keep | review |
| `scrollRestoration: false` on the router | Mid-page → top refresh flicker from stale session entries | Keep | review |
| `shared/ui` never fetches, mutates, or routes | Atoms that can't be reused or tested | Keep | review |
| Status is never color-only (`STATUS_GLYPH`) | Same-hue statuses indistinguishable (WCAG 1.4.1) | **New** | test |

## Consistency

| Rule | Prevents | Verdict | Enforced by |
| --- | --- | --- | --- |
| One `SectionLabel` definition | Drifting duplicate label atoms | Keep | ds |
| `FieldSelect` / `Select`, never a native `<select>` | Two select stacks | Keep (the vendored `native-select` is gone, so nothing to ban) | review |
| Vendored primitives are never hand-edited; Watchdog behavior goes in a `primitives` wrapper or tokens (`check:vendor`) | Every `shadcn add`, codemod, or preset change becoming a merge conflict; agents quietly patching primitives | **New** | vendor lock |
| A component with a Watchdog wrapper is imported from `shared/ui/primitives`, never from `@watchdog/ui` (the ban list follows the folder) | Silently skipping `loading`, Enter-to-confirm, `mono` | **New** | lint |
| `@theme` sizes and vanilla type classes, no `text-[Npx]` or other off-scale arbitrary values | One-off sizes and tracking that drift from the scale | Keep, **moved to lint** (`no-arbitrary-values`, layout values allowed) | lint |
| Every Tailwind class must generate CSS (`no-unknown-classes`) | Typos and removed utilities failing silently (`hovr:flex`, a deleted `text-label-sm`) | **New** | lint |
| `wd-ui-files.mjs` manifest + `/ui` fixtures for required atoms | Undocumented atoms | Keep (revisit if it slows atom work) | ds |
| TanStack Form only (no react-hook-form) | Two form libraries | Keep | review |
| Badges are meaning-named (`ConfidenceBadge`), never color-named | `variant="purple"` sprawl | Keep | review |
| `domain-badge` shim import ban | — (shim deleted; typecheck catches it) | **Dropped** | — |
| `shared/layout/section-label.tsx` re-export check | — (file deleted) | **Dropped** | — |
| `components.md` presence check | — (link checks already fail on a missing target) | **Dropped** | — |
| Docs-affect `routes/**` → `scenarios.md` strict | Every route import edit needing a scenarios touch | **Downgraded to warn** | check:docs-affected |
| Callers place components (layout, truncate) and pick a size or variant; no class patches to spacing, type, color, or shape (`no-restyle`) | Every screen re-deciding density: 140 hand-patched sites before the cleanup | **New** | lint |
| Source files ≤ 600 lines (baseline may only shrink) | Files too long to review or hand to an agent | **New** | check:size |

## Taste

These restate [`design.md`](../../../explanation/design.md); change the brief first, then the rule.

| Rule | Verdict | Enforced by |
| --- | --- | --- |
| OKLCH cool neutrals (hue 250), steel-cyan primary (220), amber signal (75); no violet | Keep | lint (`no-raw-colors`) |
| Colors via declared tokens: no raw palette hues, no undeclared `--color-*` (`no-raw-colors`), no hex in SVG attrs | Keep, **moved to lint** and widened from green/amber/red to every hue | lint |
| Radius ladder sm / md / lg; no `rounded-xl+` | Keep | ds (**now enforced**) |
| Refuse list: gradients, gradient text, glass | Keep | ds (**now enforced**; `// ds:allow-decorative` for functional blur) |
| Refuse list: nested cards, glow, icon-tile grids, bounce easing, mono-as-decoration | Keep | review |
| Refuse list: "colored side-tab accents" | **Rewritten**: decorative side borders are out; a thin state bar on a row (live/running) is fine | review |
| Flat surfaces: `--card` = `--background` | Keep (watch region separation in dark mode) | review |
| Cyan is primary / state only; hover is muted | Keep | review |
| Selection = amber wash (`bg-signal/10`) | **New** (replaces neutral `bg-muted/45`, which matched hover) | review |
| Motion: 100ms rows, 180ms dialogs; no page fades or stagger | Keep ([`motion.md`](motion.md)) | review |
| Surface names: Console / Workbench / Tape banned; Panel only in its standard meaning | **Rewritten** ([naming rule](README.md#chrome-lexicon-ui-parts)) | ds (banned names) + review |
| Copy: `Couldn't` / `Can't` / `Failed to`; no `Unable to` / `Oops` | Keep ([`ux.md`](../../../explanation/ux.md)) | review |
| Field focus: writing fields tint the border only, no outer ring | Keep | review |

## `@shadcn/lint`

Pinned at `0.2.0` (pre-1.0, single maintainer: bump deliberately). Web only. Audited 2026-09-29 against six rules; `no-restyle` was turned on the same day after the cleanup:

| Rule | State | Why |
| --- | --- | --- |
| `no-raw-colors` (`scanAllStrings`) | **On** | Class strings live in constants (`STATUS_TONES`), not just `className`. |
| `no-arbitrary-values` (layout allowed, `scanAllStrings`) | **On** | Layout one-offs (`max-w-[12rem]`) are fine; type, color, and tracking are not. |
| `no-unknown-classes` | **On** | Reads our real Tailwind theme + `@utility` roles. Known false positive: a prop named `claimClass` looks like a class prop (disable with a reason). |
| `no-restyle` (`allow: ["layout", "truncate"]`) | **On** in `domains/` + `routes/` | The audit found 292 errors at 140 sites. Most were repeats of a primitive's default (`size="sm"` + `h-6 text-xs`, `FieldSet border-0 p-0`); the rest became variants ([`atoms.md`](atoms.md#variants-not-overrides)). Four true one-offs carry a reasoned `oxlint-disable`. `shared/` is exempt: atoms own their style. |
| `no-inline-styles` | **Off** | 36 hits, mostly legitimate dynamic values (drag transforms, syntax colors, measured heights). |
| `require-static-classes` | **Off** | Flags imported class constants and helper functions, which is our normal pattern. |

Tests and the vendored package are exempt (`no-restyle` also skips `shared/`). `json-view.tsx` opts out of `no-arbitrary-values` with a file-level disable: it carries a Tokyo Night / GitHub syntax palette. Debt: move it to `--syntax-*` tokens.

## Adding a rule

1. Write the reason first: which bug, drift, or brief line does it protect?
2. Add a row here with a kind and an enforcer. If it's taste, the brief must already say it.
3. Enforce it only if it's clean today or can ratchet (flag new lines, baseline old ones).
