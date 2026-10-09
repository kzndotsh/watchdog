# UI: rules and what enforces them

Every web UI rule worth stating, with the thing that fails when it is broken. **Enforced by** names a lint rule, gate, or test; `guidance` means nothing fails and it is checked in review. The design intent behind the taste rules is [`/DESIGN.md`](../../../../DESIGN.md), which owns the wording.

Enforcers: `oxlint` (incl. `@shadcn/lint`, config in `oxlint.config.ts`) (incl. the local `watchdog/*` rules in `scripts/oxlint-plugin/`) · `check:vendor` · `check:size` · a named test · `typecheck` · `guidance`.

## Correctness

| Rule | Where | Enforced by |
| --- | --- | --- |
| Web never imports `@watchdog/db` (auth's db access lives in `@watchdog/auth`) | [`domains.md`](../domains.md) | `oxlint` `no-restricted-imports` |
| No `RoutePending` and no raw `Skeleton` in `domains/` or `routes/` (one pending surface per region) | [`loading.md`](loading.md) | `oxlint` `no-restricted-imports` |
| Client code must not import the `@watchdog/policy` barrel or `@watchdog/core` domain subpaths at runtime (use `@watchdog/policy/patch-needs-confidence`, `@watchdog/core/job-display`) | [`domains.md`](../domains.md) | `guidance` (only type imports of `@watchdog/core` subpaths exist today) |
| Opaque ids render via `IdChip` / `formatOpaqueId`, never `.slice(0, N)` | [`atoms.md`](atoms.md) | `oxlint` `watchdog/no-opaque-id-slice` (`domains/` only; `id`, `x.id`, `sha256`, `jobId`, `proposalId`, `entityId` with `.slice(0, N)`) |
| No fictional vocab (`probable`, `dormant`, `merged`); badges take schema unions | [`atoms.md`](atoms.md) | `typecheck` |
| Status is never color-only (one glyph shape per status via `STATUS_GLYPH`) | [`DESIGN.md`](../../../../DESIGN.md#colors) | test `shared/ui/__tests__/status.component.test.tsx` |
| Router keeps `scrollRestoration: false`, `defaultPendingMs` 400, `defaultPendingMinMs` 500, `defaultPreloadStaleTime` 0 | [`page-shell.md`](page-shell.md), [`loading.md`](loading.md) | test `apps/web/src/__tests__/router.test.ts` |
| One QueryClient per request via `createAppQueryClient()`; no module singleton | [`data.md`](../data.md) | `guidance` |
| Loaders await identity only; lists via `void prefetchQuery` in `warm*Queries` | [`loading.md`](loading.md) | `guidance` |
| `<Navigate>` is a sibling in the returned JSX, never an early return | [`loading.md`](loading.md) | `guidance` |
| `animate-pulse` and `aria-busy` only inside `shared/ui` | [`loading.md`](loading.md) | `guidance` |
| Base UI `Button` + `render={<Link/>}` sets `nativeButton={false}`; no `<button>` in `<button>` | [`atoms.md`](atoms.md) | `guidance` (breaks as a hydration error) |
| `DataTable`: every column sets `size`; tables use `pending`, never `PendingRegion` | [`tables.md`](tables.md) | `guidance` |
| `shared/ui` never fetches, mutates, or routes | [`atoms.md`](atoms.md) | `guidance` |

## Consistency

| Rule | Where | Enforced by |
| --- | --- | --- |
| `packages/ui/src/components` is never hand-edited (change via `pnpm ui:add` / `ui:sync`) | [`vendor.md`](vendor.md) | `check:vendor` (sha256 lock; pre-commit and CI) |
| A component with a Watchdog wrapper (Button, Dialog, AlertDialog, Combobox) is imported from `@/shared/ui/primitives/*`, not `@watchdog/ui` | [`vendor.md`](vendor.md) | `oxlint` `no-restricted-imports` (list follows the folder) + test `primitives/__tests__/wrapper-lint-coverage.test.ts` |
| No raw palette hues, undeclared `--color-*`, or hex in SVG attributes | [`DESIGN.md`](../../../../DESIGN.md#colors) | `oxlint` `shadcn/no-raw-colors` |
| No `text-[Npx]` or other off-scale arbitrary values (layout values allowed) | [`DESIGN.md`](../../../../DESIGN.md#typography) | `oxlint` `shadcn/no-arbitrary-values` |
| Every Tailwind class must generate CSS |  | `oxlint` `shadcn/no-unknown-classes` |
| Callers don't restyle components in `domains/` and `routes/`; pick a size or variant | [`atoms.md`](atoms.md#variants-not-overrides) | `oxlint` `shadcn/no-restyle` |
| Source files at most 600 lines (baseline may only shrink) |  | `check:size` |
| TanStack Form only, no react-hook-form; field errors via `fieldInvalid` / `fieldErrorList` | [`forms.md`](forms.md) | absence from `package.json` (an import fails `typecheck`); the rest `guidance` |
| Mutations and SSE use the named contracts in `shared/lib/query-invalidation.ts`; `useMutation` and cache writes only in hooks, query keys only in queries modules | [`data.md`](../data.md#mutations-and-cache-writes) | `oxlint` `watchdog/mutation-only-in-hooks`, `watchdog/cache-writes-only-in-hooks`, `watchdog/query-keys-in-queries-modules` (baselined); the named-contract choice is `guidance` |
| No manual Refresh buttons on live paths | [`data.md`](../data.md) | `guidance` |
| Screens are named by layout kind; Console / Workbench / Tape banned; never a screen named `*Panel` | [`README.md`](README.md#chrome-lexicon-ui-parts) | `oxlint` `watchdog/no-banned-surface-name` (export names only); `*Panel` is `guidance` |
| Copy: `Couldn't` / `Can't` / `Failed to`; Title Case labels; `Verb + Noun` primaries | [`ux.md`](../../../explanation/ux.md) | `guidance` |

## Taste

| Rule | Enforced by |
| --- | --- |
| Gradients, gradient text, glass or backdrop blur (`// ds:allow-decorative - reason` for functional blur) | `oxlint` `watchdog/no-decorative-class` (all of `apps/web/src` except `shared/ui/primitives/` and `auth/ui/`) |
| Radius ladder sm / md / lg | `--radius-xl..4xl` capped in `styles/wd-theme.css` (by construction) |
| Writing fields tint the border on focus, no outer ring | `styles/wd-overrides.css` (CSS) |
| Nested cards, glow, icon-tile grids, bounce easing, mono-as-decoration, decorative side borders | `guidance` |
| Flat surfaces (`--card` = `--background`); cyan is primary/state only; hover is muted | `guidance` |
| Selection is an amber wash (`bg-signal/10`) | `guidance` |
| Motion budgets (100ms rows, 180ms dialogs; no page-mount fades or stagger) | `guidance` |

## `@shadcn/lint`

Pinned at `0.2.0` (pre-1.0, single maintainer: bump deliberately). Web only; tests and the vendored package are exempt, and `no-restyle` also skips `shared/` because atoms own their style.

| Rule | State | Why |
| --- | --- | --- |
| `no-raw-colors` (`scanAllStrings`) | On | Class strings live in constants (`STATUS_TONES`), not just `className`. |
| `no-arbitrary-values` (layout allowed, `scanAllStrings`) | On | Layout one-offs (`max-w-[12rem]`) are fine; type, color, and tracking are not. |
| `no-unknown-classes` | On | Reads our Tailwind theme. A prop named `claimClass` looks like a class prop (disable with a reason). |
| `no-restyle` (`allow: ["layout", "truncate"]`) | On in `domains/` + `routes/` | The linter follows `shared/ui/primitives` wrappers to the vanilla primitive; `wrapper-lint-coverage.test.ts` spawns oxlint (60s timeout) and fails if a wrapper stops being checked. |
| `no-inline-styles` | Off | Mostly legitimate dynamic values (drag transforms, measured heights). |
| `require-static-classes` | Off | Flags imported class constants and helpers, our normal pattern. |

`json-view.tsx` opts out of `no-arbitrary-values` with a file-level disable because it carries a syntax palette; moving it to `--syntax-*` tokens is open debt.

## Adding a rule

Write the reason first (which bug, drift, or design line it protects), add a row here with its enforcer, and enforce it only if it is clean today or can ratchet. If it is taste, [`DESIGN.md`](../../../../DESIGN.md) must already say it.
