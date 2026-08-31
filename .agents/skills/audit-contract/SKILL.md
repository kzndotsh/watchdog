---
name: audit-contract
description: >-
  Use when checking whether code in a package or app matches the contract
  declared in its nearest AGENTS.md: the Boundaries table, Accept tiers
  (unverified/possible/confirmed), the ingress path (Intake to Evidence,
  Caps interpret to Proposal to Inbox Accept), or source-of-truth rules
  (Postgres Case Graph, Export as projection). Trigger on "audit the
  boundaries", "does this follow AGENTS.md", "check contract drift",
  "verify against the docs", before opening a PR, or after finishing a
  feature that touches a package's public surface. Do NOT trigger for
  general code quality, lint, style, or security review — desloppify,
  bugbot, react-doctor, and security-review already own those and know
  nothing about Watchdog's contracts.
metadata:
  owner: watchdog
  sources: AGENTS.md, docs/explanation/product.md
---

# Audit contract

Checks declared rules against what the code actually does. Not a quality scan.

## Outcomes

- **Clean** — no findings; say so plainly, do not pad the report.
- **Changed** — never for this skill; it edits nothing.
- **Blocked** — the nearest `AGENTS.md` has no Boundaries table or Accept-tier
  language to check against; say so and stop rather than inventing a contract.

## Edit scope

Read-only. Reports inline with citations. Never edits code, docs, or config.

## Instructions

1. Identify the subsystem under audit from the user's message — a
   package/app path, a PR diff, or "this change". If ambiguous, ask.
2. Read the nearest `AGENTS.md` up the tree from that path (package → root).
   Extract its Boundaries table, any Accept-tier or ingress language, and
   any explicit source-of-truth rule.
3. Read the actual code for that subsystem, not a summary of it. Follow
   imports one level where a boundary claim depends on a neighbor (e.g.
   "Caps never write the Graph" requires checking Caps do not import
   `@watchdog/db`).
4. For each Boundaries row, check the "Do" side is followed and the "Don't"
   side is absent. Check whether new/changed code ever sets `confirmed`
   outside a human Accept path, and whether Cap or agent output lands as
   anything but `unverified` plus `userOverride` when it writes the Graph.
5. Report inline, one finding per Boundaries row or rule, each with a code
   citation (`path:line`) and the `AGENTS.md` line it derives from. Never
   claim a violation without both citations.
6. If everything holds, say so in one line per area checked. This skill
   produces no artifact and edits nothing — the report is the output.

## Gotchas

- A missing Boundaries row is not evidence of correctness, only silence.
  Say "not covered by AGENTS.md" rather than "compliant" when a rule does
  not exist.
- Adversarial-test claims the same way the Investigation discipline requires
  of case work: the absence of a violation in the files you read is not
  proof across the whole subsystem.
- Breach/credential handling has its own caveats (`docs/reference/platform/caps-lexicon.md` D5) — do
  not flag stored plaintext as a violation without checking whether the
  source is metadata-only.
