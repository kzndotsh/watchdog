# Custody contract

**What this is:** Accept confidence tiers and write gates for Graph mutations.  
**What this is not:** Triage UI chrome ([web domains](../web/domains.md)), schema Zod details ([`../platform/types.md`](../platform/types.md)).

## Accept tiers

Platform Accept tiers: **`unverified` / `possible` / `confirmed`**.

- Cap/agent output stays **`unverified`** until human Accept.
- CLI/agent graph writes land at **`unverified`** only; CLI refuses `confidence=confirmed`.
- **`confirmed`** requires human Accept (Triage) or Dossier with evidence gates: never Cap/agent alone. The rule and its message have one home, `packages/policy/src/confirmed-evidence.ts` (`confirmedNeedsEvidence`, `CONFIRMED_REQUIRES_EVIDENCE`; browser subpath `@watchdog/policy/confirmed-evidence`). Callers count the Evidence (attachments, linked job Evidence, an attestation) and pass the total; the message text is never copied.

## Identifier / patch gates

- Invalid Identifier ops **block** Accept (`listInvalidIdentifierOps`).
- Identifier collisions **warn** (Alert + chip); Accept still allowed.
- Custody helpers live in `@watchdog/policy` (`assertPatchGates`, `patchNeedsConfidence`): pure, DB-free. Browser UI imports `patchNeedsConfidence` from `@watchdog/policy/patch-needs-confidence` only (package root pulls Effect-tagged gates into the client).

Enforced by: the patch schema rejects `confidence` on claim/identifier/edge ops (`packages/schemas/src/patch.ts`), `assertPatchGates` in `@watchdog/policy`, the core write gate (`validateIdentifierWrite`), and CLI custody envelopes (`apps/cli`). Collisions are annotated on `ProposalRecord.identifierCollisions` by core when listing Proposals. The browser-import rule is enforced only by the package exports map; no lint rule.

## Breach caveat

Treat a breach hit as evidence that a record exists in a dump, not as proof the person controls the account. Adversarial-test every identity link before proposing it (guidance; nothing enforces it). Cap D5: [`../platform/caps-lexicon.md`](../platform/caps-lexicon.md).
