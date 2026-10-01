# UI primitives package (`@watchdog/ui`)

> Scope: `packages/ui` (inherits root AGENTS.md)

The shadcn primitives (`base-mira`, Base UI) exactly as the shadcn CLI writes them. Nothing here is hand-written except `components.json`, `package.json`, `tsconfig.json`, and the vendor lock. Watchdog behavior lives in `apps/web/src/shared/ui/primitives` (wrappers), not here.

## Commands

| Task                   | Command                                |
| ---------------------- | -------------------------------------- |
| Verify no hand edits   | `pnpm check:vendor`                    |
| Add a primitive        | `pnpm ui:add <name>`                   |
| Update every primitive | `pnpm ui:sync`                         |
| Typecheck              | `pnpm --filter @watchdog/ui typecheck` |

## Rules

- **Never edit** `src/components/**` or `src/hooks/**`. They are generated; `vendor.json` hashes them and `pnpm check:vendor` (pre-commit + CI) fails on any edit, stray file, or missing file.
- **Need a different default, variant, prop, or behavior?** Change a CSS token, or add a same-name wrapper in `apps/web/src/shared/ui/primitives/<name>.tsx` (only for behavior that must apply everywhere). Do not patch the primitive.
- **Update or add** only through `pnpm ui:sync` / `pnpm ui:add` (they re-run the CLI for every component so output stays deterministic), then review `git diff packages/ui` and fix wrappers if an API moved.
- Do not add files under `src/components` by hand, and do not format or lint them (oxlint / oxfmt / lefthook skip them on purpose).
- Apps import vanilla primitives directly (`@watchdog/ui/components/<name>`). If a wrapper exists in `shared/ui/primitives`, import that instead: oxlint bans the vanilla path for exactly those components.
- `components.json` here is the source of truth for `style` / `iconLibrary` / `baseColor`; `apps/web/components.json` mirrors it.

## See also / External References

| Need | File |
| --- | --- |
| Vendor workflow | [`docs/reference/web/ui/vendor.md`](../../docs/reference/web/ui/vendor.md) |
| Wrappers | [`docs/reference/web/ui/atoms.md`](../../docs/reference/web/ui/atoms.md) |
| Web UI rules | [`apps/web/AGENTS.md`](../../apps/web/AGENTS.md) |
