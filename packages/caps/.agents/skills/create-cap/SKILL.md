---
name: create-cap
description: >-
  Use when authoring a new Cap in packages/caps — deciding its id/title/kind,
  working through the D1-D5 pre-code decisions, and shipping it end to end.
  Trigger on "add a new cap", "create a collect/enrich/process/act cap for
  X", "what should this cap's id be", or "ship this cap". Do NOT trigger for
  editing an existing Cap's logic, fixing a bug in interpret(), or general
  packages/caps questions that do not involve adding a new Cap id.
metadata:
  owner: watchdog
  sources: docs/reference/platform/caps-lexicon.md, packages/caps/AGENTS.md
---

# Create cap

Orchestrates the D1-D5 decision method and authoring checklist already
documented in `docs/reference/platform/caps-lexicon.md` and `packages/caps/AGENTS.md`. Does not
restate their content — read them; this skill only sequences the steps.

## Outcomes

- **Clean** — no new Cap needed; the workflow surfaced an existing Cap that
  already covers the need.
- **Changed** — a new Cap folder exists, registered, `pnpm generate:caps`
  run, catalog diff committed.
- **Blocked** — a naming/category/D1-D5 call is genuinely ambiguous; surface
  the specific ambiguity and ask rather than guessing a slot-3 verb.

## Edit scope

Writes only inside the new Cap's folder
(`packages/caps/src/<category>/<axis>.<method>/`) plus the generated
`capabilities.gen.json` via the generator. Does not touch other Caps,
`@watchdog/core`, `@watchdog/db`, or apps.

## Instructions

1. Read `docs/reference/platform/caps-lexicon.md` sections "Three layers" and "Reserved categories" —
   settle category, salient axis, and method (slot 3) before writing code.
2. Walk D1-D5 in `docs/reference/platform/caps-lexicon.md` for anything the new Cap touches: Identifier
   landing shape (D1), passive vs active `useCases`/`invasive` (D2),
   named-check exemption (D3), one-request-per-origin (D4), breach
   credential handling (D5). Record the answers; do not skip silently.
3. Confirm the id is unique and follows `<category>.<axis>.<method>` —
   exactly 3 lowercase snake_case segments — against the existing catalog
   (`packages/caps/capabilities.gen.json`).
4. Scaffold the Cap folder per `packages/caps/AGENTS.md` Gotchas layout:
   minimal Collect gets `{cap.ts, interpret.ts, input.ts, report-schema.ts}`;
   reuse shared helpers (`evidence/lib/`, `lib/collect/`) instead of
   duplicating them.
5. Run the authoring checklist from `packages/caps/AGENTS.md`: interpret
   target, named source, credential path, passive/active flags, egress —
   before registering.
6. Add the Cap to the registry, then run `pnpm generate:caps` and commit
   the resulting `capabilities.gen.json` diff.
7. Add `__tests__/interpret.test.ts`; use `itRunsCollectCap` from
   `@watchdog/test-kit/it` unless the Cap needs a dedicated `run.test.ts`
   (harvest / extract.ai / url.enrich / file.analyze / eml.analyze pattern).

## Gotchas

- Cap `run` is Effect `CapRun` (not a Promise). Tests use `runCap` /
  `itRunsCollectCap` (provides `toolsHttpClientLayer`). Prefer
  `defineCollectCap` for Collect Caps. `interpret` stays pure/sync.
- Caps never write the Graph — `interpret` returns Proposal ops only. If a
  step in this workflow starts looking like a Graph write, stop; that
  belongs in Inbox Accept, not a Cap.
- Refused vocabulary (module / analyzer / neuron / enricher / transform /
  connector / Mutation / Scratch / Candidate / Promote) is checked by
  `pnpm check:agents:strict`, not by this skill — do not skip that gate
  because this workflow ran.
