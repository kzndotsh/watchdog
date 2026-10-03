# Close-out checks

Load this when: running `/finalize` after a work chunk — test gaps and
scoped doc accuracy. Not a full-repo audit. Lint, `console.log`,
`@ts-ignore`, unused imports, and the 600-line `src` budget are enforced by
`pnpm fix` / `pnpm check` / `pnpm check:size`; do not re-audit them by hand.

## Hygiene (dirty files only)

- Stay in the requested scope: no drive-by refactors, no new `any` or
  `as unknown as` to silence types.
- Do not add a `CHANGELOG.md`; this repo does not keep one.
- After gates pass, draft commits via [commit-plan.md](commit-plan.md);
  do not commit in the close-out turn.

## Tests

Behavior change with no covering test → add one, or report **Blocked**.

Find related tests by co-located `__tests__/`, suffix from
[`docs/contributing/testing/standards.md`](../../../../docs/contributing/testing/standards.md),
and grep for the export name. Prefer the matching `pnpm test:*` over the
whole suite. If a gate fails: code bug → fix code; obsolete assertion →
update the test; unclear product → **Blocked**.

## Docs (mapped pages only)

After patching `scripts/doc-map.mjs` targets, check those pages against
the diff: commands/paths/nouns still true, no unverified examples. Run
`pnpm check:docs:strict` via check-gates; do not crawl every `docs/**` page.
