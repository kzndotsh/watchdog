# Custody contract

**What this is:** Accept confidence tiers and write gates for Graph mutations.  
**What this is not:** Triage UI chrome ([web domains](../web/domains.md)), schema Zod details ([`../platform/types.md`](../platform/types.md)).

## Accept tiers

Platform Accept tiers: **`unverified` / `possible` / `confirmed`**.

- Cap/agent output stays **`unverified`** until human Accept.
- CLI/agent graph writes land at **`unverified`** only; CLI refuses `confidence=confirmed`.
- **`confirmed`** requires human Accept (Triage) or Dossier with evidence gates — never Cap/agent alone.

## Identifier / patch gates

- Invalid Identifier ops **block** Accept (`listInvalidIdentifierOps`).
- Identifier collisions **warn** (Alert + chip); Accept still allowed.
- Custody helpers live in `@watchdog/policy` (`assertPatchGates`, `patchNeedsConfidence`) — pure, DB-free.

## Breach caveat

Treat a breach hit as evidence that a record exists in a dump, not as proof the person controls the account. Adversarial-test every identity link before proposing it. Cap D5: [`../platform/caps-lexicon.md`](../platform/caps-lexicon.md).
