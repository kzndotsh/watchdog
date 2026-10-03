# UI primitives package (`@watchdog/ui`)

> Scope: `packages/ui` (inherits root AGENTS.md)

The shadcn primitives (`base-mira`, Base UI) exactly as the shadcn CLI writes them. Watchdog behavior lives in `apps/web/src/shared/ui/primitives` (same-name wrappers), not here. Workflow: [`vendor.md`](../../docs/reference/web/ui/vendor.md).

## Commands

| Task                   | Command                                |
| ---------------------- | -------------------------------------- |
| Verify no hand edits   | `pnpm check:vendor`                    |
| Add a primitive        | `pnpm ui:add <name>`                   |
| Update every primitive | `pnpm ui:sync`                         |
| Typecheck              | `pnpm --filter @watchdog/ui typecheck` |

## Rules

- Never edit `src/components/**` or `src/hooks/**`. `vendor.json` hashes them and `pnpm check:vendor` (pre-commit + CI) fails on any edit, stray file, or missing file. Oxlint/oxfmt skip them on purpose.
- Need a different default, variant, or behavior? Change a CSS token, or add a wrapper in `apps/web/src/shared/ui/primitives/<name>.tsx`. Do not patch the primitive.
- Update only via `pnpm ui:sync` / `pnpm ui:add`, then review `git diff packages/ui` and fix wrappers if an API moved. `components.json` here is the source of truth for `style` / `iconLibrary` / `baseColor`; `apps/web/components.json` mirrors it (guidance).
