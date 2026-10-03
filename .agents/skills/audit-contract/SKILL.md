---
name: audit-contract
description: >-
  Use when checking whether code in a package or app matches the contract
  declared in its nearest AGENTS.md: its Rules/Boundaries tables, Accept tiers
  (unverified/possible/confirmed), the ingress path (Intake to Evidence,
  Caps interpret to Proposal to Triage Accept), or source-of-truth rules
  (Postgres Case Graph, Export as projection). Trigger on "audit the
  boundaries", "does this follow AGENTS.md", "check contract drift",
  "verify against the docs", before opening a PR, or after finishing a
  feature that touches a package's public surface. Do NOT trigger for
  general code quality, lint, style, or security review.
metadata:
  owner: watchdog
  sources: AGENTS.md, docs/reference/contracts/custody.md, docs/reference/contracts/ingress.md
---

# Audit contract

Checks the rules no gate checks against what the code actually does. Rows marked "Enforced by" a lint rule, `package.json`, or a `check:*` script are the gate's job; audit the ones marked guidance, plus the custody and ingress contracts in `docs/reference/contracts/`.

## Outcomes

- **Clean** — no findings; say so plainly, do not pad the report.
- **Blocked** — neither the nearest `AGENTS.md` nor `docs/reference/contracts/` states a rule for the area; say so and stop rather than inventing a contract.

## Edit scope

Read-only. Reports inline with citations. Never edits code, docs, or config.

## Instructions

1. Identify the subsystem from the user's message (a path, a PR diff, or "this change"). If ambiguous, ask.
2. Read the nearest `AGENTS.md` up the tree (package → root) and the relevant contract in `docs/reference/contracts/`. Extract the guidance rules, Accept-tier language, and source-of-truth rules.
3. Read the actual code, not a summary. Follow imports one level where a rule depends on a neighbor (e.g. "Caps never write the Graph" requires checking Caps do not import `@watchdog/db`).
4. Check each rule: the "Do" is followed and the "Don't" is absent. Check whether new code sets `confirmed` outside a human Accept path. Check Caps and agents separately: a Cap never writes the Graph, with or without `userOverride`; an agent or CLI Graph write must land as `unverified` with `userOverride`.
5. Report inline, one finding per rule, each with a code citation (`path:line`) and the rule's source line. Never claim a violation without both citations. If everything holds, say so in one line per area.

## Gotchas

- A missing rule is silence, not compliance: say "not covered" rather than "compliant".
- The absence of a violation in the files you read is not proof across the whole subsystem.
- Breach/credential handling has its own caveats (`docs/reference/platform/caps-lexicon.md` D5): do not flag stored plaintext without checking whether the source is metadata-only.
