# Close-out checks

Load this when: running `/finalize` after a work chunk — hygiene, test
gaps, and scoped doc accuracy. Not a full-repo audit.

Adapted from Tux `.cursor/commands/` (`review-existing-diffs`, `deslop`,
`run-tests`/`write-tests`, `update-docs`/`validate-docs`). Watchdog
commands and docs win.

## Hygiene (dirty files only)

- No `console.log` / leftover debug, commented-out blocks, or unused
  imports the linter would catch after `pnpm fix`.
- No new `any`, `# ts-ignore`, or `as unknown as` to silence types.
- No file over 1600 lines; split rather than land bloat.
- Stay in the requested scope — no drive-by refactors.
- Do not add a `CHANGELOG.md`; this repo does not keep one.
- After gates pass, draft commits via [commit-plan.md](commit-plan.md);
  do not commit in the close-out turn.

## Tests

Behavior change with no covering test → add one, or report **Blocked**.

Find related tests by co-located `__tests__/`, suffix from
[`docs/contributing/testing/standards.md`](../../../../docs/contributing/testing/standards.md)
(`*.test.ts`, `*.component.test.tsx`, `*.int.test.ts`, `e2e/specs/*.spec.ts`),
and grep for the export name. Prefer the matching `pnpm test:*` over the
whole suite.

New tests: AAA, one behavior per `it`, assert contracts not call
sequences. If a gate fails: code bug → fix code; obsolete assertion →
update the test; unclear product → **Blocked**.

## Docs (mapped pages only)

After patching `scripts/doc-map.mjs` targets, check those pages against
the diff: commands/paths/nouns still true, no Diátaxis mix on one leaf,
no unverified examples. Run `pnpm check:docs:strict` via check-gates —
do not rebuild a docs site or crawl every `docs/**` page.
