---
name: finalize
description: >-
  Use when finishing a chunk of work, before considering a task done, or
  when the user types /finalize, "wrap this up", "close the loop", or
  "run the post-change checks". Hygiene, mapped docs, tests, gates, then
  a conventional commit plan for approval. Do NOT trigger mid-implementation
  or when the user names one specific command (e.g. "run pnpm typecheck").
metadata:
  owner: watchdog
  sources: lefthook.yml, docs/contributing/ci-gates.md, docs/contributing/testing/standards.md, scripts/doc-map.mjs, .agents/skills/check-gates/SKILL.md
---

# Finalize

Closes a work chunk so lefthook/CI will not surprise, then drafts grouped
commits and **stops for approval**. Gate logic lives in check-gates; this adds docs, tests, and the commit plan.

## Outcomes

- **Clean** — close-out done; gates pass; commit plan posted; nothing committed.
- **Changed** — files were edited to close the chunk; list them.
- **Committed** — only after explicit approval; list SHAs.
- **Blocked** — gate, missing tests, or doc-affect needs a product call; report verbatim and stop.

## Edit scope

May edit mapped docs, nested `AGENTS.md`, tests for the dirty behavior, generated artifacts (via generators), and files a failing gate points at. May `git commit` only after the user approves the posted plan. Does not push or change gate config unless asked.

## Instructions

1. List dirty paths (`git status --porcelain`; add `git diff --name-only` if needed).
2. Load [close-out.md](references/close-out.md) and apply hygiene + test-gap on those paths.
3. Docs: patch the pages that [`scripts/doc-map.mjs`](../../../scripts/doc-map.mjs) maps to the dirty code, verifying claims against the diff. No new docs unless asked.
4. Touch a nested `AGENTS.md` only if its Commands or a rule/gotcha actually changed.
5. If caps / api+client / web routes changed, run `pnpm generate:caps`, `pnpm generate:client`, or `pnpm generate-routes`. Do not hand-edit generated output.
6. Run `pnpm fix`, then read and execute [check-gates](../check-gates/SKILL.md) on the current dirty set.
7. If `apps/web` UI behavior changed and browser tools exist, exercise the flow; otherwise say what was not verified.
8. Load [commit-plan.md](references/commit-plan.md), review **all** uncommitted work, draft the grouping, post it, and **stop**. On explicit approval only, execute that plan (or the user's edited version).

## Gotchas

- Mapped docs travel in the same commit as the code that affects them.
- Do not start this while implementation is still in progress, and do not run a repo-wide docs or desloppify pass: stay on the dirty set.
