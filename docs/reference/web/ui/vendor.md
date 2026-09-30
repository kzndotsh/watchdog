# UI: vendored primitives

This page defines how shadcn primitives are vendored, locked, updated, and wrapped. The hub is [`../UI.md`](../UI.md).

## Layers

| Layer | Path | Owns | Edit? |
| --- | --- | --- | --- |
| Primitives | `packages/ui` (`@watchdog/ui`) | shadcn `base-mira` components + `use-mobile`, exactly as the CLI writes them | **Never by hand** |
| Wrappers | `apps/web/src/shared/ui/primitives/` | Same-name wrappers where a behavior must apply everywhere (Button, Dialog, AlertDialog, Combobox, Input, Textarea) | Yes |
| Atoms | `apps/web/src/shared/ui/` | `QueueRow`, `SplitView`, status glyphs, data-table kit, `toast`, … (own names) | Yes |
| Tokens / CSS | `apps/web/src/styles*` | Color, radius ladder, type roles, focus chrome (`data-slot` overrides) | Yes |

Domain code imports vanilla primitives from `@watchdog/ui/components/<name>` and wrapped ones from `@/shared/ui/primitives/<name>`. oxlint bans the vanilla path for exactly the components that have a wrapper.

## Where a change goes

1. **Look, scale, radius, color** → a CSS token (`wd-theme.css`, `wd-tokens.css`). Example: `--radius-xl` is capped at `--radius-lg`, so upstream `rounded-xl` lands on our ladder.
2. **A behavior that must apply everywhere** (a prop the whole app relies on) → a same-name wrapper in `primitives/` that composes the untouched upstream component. **A distinct pattern** → a new component with its own name in `shared/ui`. **Just a different look** → neither; use the stock component (see [`atoms.md`](atoms.md#variants-not-overrides)).
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
- Upstream components import `cn` from the `cn` package directly, not from `@/lib/utils`. Our `cn` (`createCn` from `cn/config`, extended with the type roles; replaces `clsx` + `tailwind-merge`) is used by atoms and wrappers; primitives use stock `cn`, which reads `text-label-*` roles as text **colors** (`cn("text-muted-foreground", "text-label-mono-sm")` drops the color). Keep type roles out of `className` passed into primitives (`no-restyle` enforces this).
- `apps/web` tsconfig has `noUnusedLocals` off: upstream files pulled into its program carry unused `React` imports. oxlint `no-unused-vars` covers our own code.
- `apps/web/components.json` mirrors `packages/ui/components.json` (`style`, `iconLibrary`, `baseColor`). Run `add` from `packages/ui`.
- Presets: shadcn says `components.json` `style` cannot change after init. Use `shadcn apply <preset>` (`--only theme|font` skips reinstalling components) from `packages/ui`, then `pnpm ui:sync`. `tailwind.css` in that file points at an unused stub (`src/styles/globals.css`) on purpose, so the CLI can never write into our real tokens.
- **Upstream owns some behavior**: `SidebarProvider` binds Ctrl/Cmd+B itself, `Tooltip` defaults to `delay=0` (the app root passes `delay={500}`), `Textarea` is `resize-none`, `Combobox` popups anchor to the input (Mira widens them by the trigger). Don't re-implement these in app code; if one is wrong for us, wrap it in `primitives/`. Before adding a global listener near a vendored component, grep `packages/ui` for `addEventListener`.
- Base UI lets `className` / `style` be a function of state; `cn` (like clsx) ignores function values, so pass strings to primitives and keep state-based styling in `data-*` variants.
- Base UI `render={<X />}` targets must forward `ref` and spread props (React 19 ref-as-prop does this); our wrappers spread `...props`, so `render={<Button … />}` works.
