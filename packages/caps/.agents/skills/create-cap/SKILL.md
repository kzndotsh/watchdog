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

Sequences the D1-D5 decision method and authoring checklist documented in
`docs/reference/platform/caps-lexicon.md` and `packages/caps/AGENTS.md`.
Does not restate them: read them.

## Outcomes

- **Clean** — no new Cap needed; an existing Cap already covers the need.
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

1. Read `caps-lexicon.md` "Three layers" and "Reserved categories"; settle
   category, salient axis, and method (slot 3) before writing code.
2. Walk D1-D5 in `caps-lexicon.md` for anything the new Cap touches:
   Identifier landing shape (D1), passive vs active `useCases`/`invasive`
   (D2), named-check exemption (D3), one-request-per-origin (D4), breach
   credential handling (D5). Record the answers; do not skip silently.
3. Confirm the id is unique against `packages/caps/capabilities.gen.json`
   and follows `<category>.<axis>.<method>`. Nothing enforces the format and
   one shipped id (`evidence.harvest`) has two segments, so match the
   existing ids in the same category.
4. Scaffold the Cap folder per the `packages/caps/AGENTS.md` Gotchas layout;
   reuse shared helpers (`evidence/lib/`, `lib/collect/`) instead of
   duplicating them.
5. Run the authoring checklist: interpret target, named source, credential
   path, passive/active flags, egress, before registering.
6. Add the Cap to the registry, run `pnpm generate:caps`, and commit the
   `capabilities.gen.json` diff.
7. Add `__tests__/interpret.test.ts`; use `itRunsCollectCap` (`src/testing`)
   unless the Cap needs a dedicated `run.test.ts` (harvest / extract.ai /
   url.enrich / file.analyze / eml.analyze pattern).

## Gotchas

- Cap `run` is an Effect (`CapRun`), `interpret` stays pure/sync; prefer
  `defineCollectCap` for Collect Caps.
- Caps never write the Graph: `interpret` returns Proposal ops only. If a
  step starts looking like a Graph write, stop; that belongs in Triage Accept.
