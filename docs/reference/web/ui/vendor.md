# UI: vendored primitives

This page defines how shadcn primitives are vendored, locked, updated, and wrapped. The hub is [`../UI.md`](../UI.md).

## Layers

| Layer | Path | Owns | Edit? |
| --- | --- | --- | --- |
| Primitives | `packages/ui` (`@watchdog/ui`) | shadcn `base-mira` components + `use-mobile`, exactly as the CLI writes them | **Never by hand** |
| Facade | `apps/web/src/shared/ui/shadcn/` | One-line re-exports; wrappers that add Watchdog props / variants / behavior; `toast` (Watchdog-owned) | Yes |
| Atoms | `apps/web/src/shared/ui/` | `QueueRow`, `SplitView`, status glyphs, data-table kit, … | Yes |
| Tokens / CSS | `apps/web/src/styles*` | Color, radius ladder, type roles, focus chrome (`data-slot` overrides) | Yes |

Domain code imports primitives from `@/shared/ui/shadcn/*`. oxlint bans `@watchdog/ui/*` outside the facade.

## Where a change goes

1. **Look, scale, radius, color** → a CSS token (`wd-theme.css`, `wd-tokens.css`). Example: `--radius-xl` is capped at `--radius-lg`, so upstream `rounded-xl` lands on our ladder.
2. **A prop, variant, or behavior** → a facade wrapper that composes the untouched upstream component (see the table in [`atoms.md`](atoms.md#variants-not-overrides)).
3. **A better upstream** → bump with `pnpm ui:sync`, or open an upstream issue. Never patch `packages/ui`.

## Lock

`packages/ui/vendor.json` lists the components, the style, and a sha256 for every vendored file. `pnpm check:vendor` (pre-commit and CI) fails on an edited, missing, or unlisted file. The formatter, linter, and lefthook skip `src/components` and `src/hooks` so bytes stay identical to the CLI's.

| Task | Command |
| --- | --- |
| Verify | `pnpm check:vendor` |
| Add a primitive | `pnpm ui:add <name>` |
| Update all (also after a preset / CLI bump) | `pnpm ui:sync` |
| Remove a primitive | `node scripts/ui-vendor.mjs remove <name>` |

`ui:sync` and `ui:add` re-run the CLI for **every** component: the CLI treats dependency-only installs differently from named ones (it keeps `"use client"`), so output is deterministic only when everything is named. After a sync, review `git diff packages/ui` and update wrappers if an API moved.

## Gotchas

- Run the CLI as `pnpm dlx shadcn@latest`. The repo's `zod` override breaks the locally installed `shadcn` binary (`o.deepPartial is not a function`).
- Upstream components import `cn` from the `cn` package directly, not from `@/lib/utils`. Our `cn` (which knows the type roles) is used by atoms and wrappers; primitives use stock `cn`, which reads `text-label-*` roles as text **colors**. Keep type roles out of `className` passed into primitives (`no-restyle` enforces this).
- `apps/web` tsconfig has `noUnusedLocals` off: upstream files pulled into its program carry unused `React` imports. oxlint `no-unused-vars` covers our own code.
- `apps/web/components.json` mirrors `packages/ui/components.json` (`style`, `iconLibrary`, `baseColor`). Run `add` from `packages/ui`.
- Presets: switching `base-mira` → another style is `components.json` `style` + `pnpm ui:sync`; wrappers written against upstream props are the only code that can break.
