# UI: rules inventory

This page lists every web UI rule, what it prevents, and whether it is kept. The design intent behind the taste rules is [`../../../explanation/design.md`](../../../explanation/design.md). Last audited 2026-09-29.

**Kinds.** **Correctness** rules stop a bug class: keep unless the bug can no longer happen. **Consistency** rules keep one way to do a thing: cheap, keep while they cost nothing. **Taste** rules are design opinions: they live in the brief and change when the brief changes.

**Enforced by:** `ds` = `pnpm --filter @watchdog/web ds:check` · `lint` = oxlint · `test` = unit/component test · `review` = PR checklist only.

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
| `FieldSelect` / `Select`, never `NativeSelect` | Two select stacks | Keep | ds |
| Type roles / `@theme` sizes, no `text-[Npx]` | One-off font sizes | Keep | ds |
| `wd-ui-files.mjs` manifest + `/ui` fixtures for required atoms | Undocumented atoms | Keep (revisit if it slows atom work) | ds |
| TanStack Form only (no react-hook-form) | Two form libraries | Keep | review |
| Badges are meaning-named (`ConfidenceBadge`), never color-named | `variant="purple"` sprawl | Keep | review |
| `domain-badge` shim import ban | — (shim deleted; typecheck catches it) | **Dropped** | — |
| `shared/layout/section-label.tsx` re-export check | — (file deleted) | **Dropped** | — |
| `components.md` presence check | — (link checks already fail on a missing target) | **Dropped** | — |
| Docs-affect `routes/**` → `scenarios.md` strict | Every route import edit needing a scenarios touch | **Downgraded to warn** | check:docs-affected |
| Source files ≤ 600 lines (baseline may only shrink) | Files too long to review or hand to an agent | **New** | check:size |

## Taste

These restate [`design.md`](../../../explanation/design.md); change the brief first, then the rule.

| Rule | Verdict | Enforced by |
| --- | --- | --- |
| OKLCH cool neutrals (hue 250), steel-cyan primary (220), amber signal (75); no violet | Keep | ds (off-palette hues) |
| Status / confidence / kind colors via tokens, never raw green/amber/red | Keep | ds |
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

## Adding a rule

1. Write the reason first: which bug, drift, or brief line does it protect?
2. Add a row here with a kind and an enforcer. If it's taste, the brief must already say it.
3. Enforce it only if it's clean today or can ratchet (flag new lines, baseline old ones).
