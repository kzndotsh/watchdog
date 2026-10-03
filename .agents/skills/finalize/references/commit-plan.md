# Commit plan

Load this when: `/finalize` gates are clean and uncommitted work
remains — draft grouped conventional commits, then stop for approval.

## Review

Read all uncommitted work before grouping: `git status --porcelain`,
`git diff` (unstaged + staged), and `git log -15 --format='%s'` for this
repo's subject style. Include untracked files. Exclude secrets (`.env*`,
credentials, keys).

## Grouping (more commits, not fewer)

Each commit is one reviewable concern.

Keep together: a behavior + its tests; mapped docs with the code that
triggered `scripts/doc-map.mjs` (commit-msg `docs-affect` fails if the code
lands first); a generator run with its artifact.

Split: shared primitive vs first consumer vs later surfaces; `fix` vs
`feat`; docs-only vs product; CI/config vs app code.

Assign **whole files** to a commit (no `git add -p` / `-i`). If one file
mixes two concerns, put it with the later consumer and note that in the
plan. Order: dependencies first.

## Message

Conventional: `type(scope): subject`. Types: `feat` `fix` `docs`
`refactor` `test` `chore` `ci` `perf`. Scopes seen in `git log`: `web`,
`api`, `db`, `core`, `cli`, `worker`, `scripts`, `e2e`; match `git log`
when unsure. Subject: imperative, lowercase after the colon, no trailing
period, ~72 chars. Body (when needed): why, not a file list. No emojis.

Use `docs:allow-affect — <reason>` in the body only when mapped docs are
intentionally omitted.

## Approval gate

Post the plan as a numbered list: files, proposed message (subject +
body). **Stop. Do not run `git commit`.** Commit only on an explicit yes
in a later turn (`commit that`, `lgtm`, `approved`, edits to the plan).
Re-read status before executing; if the tree changed, re-draft and stop
again. Then `git add` the planned paths and `git commit` per commit; never
`--no-verify`, never push. After the last commit, `git status` and report SHAs.
