# Caps guide

> Scope: `packages/caps` (Caps, Playbooks, the Cap SDK in `src/sdk/`). Inherits the root [AGENTS.md](../../AGENTS.md); outbound HTTP rules: [`packages/server/AGENTS.md`](../core/AGENTS.md#outbound-http-packagestools-packagesai).

A Cap never writes the Graph: `run` collects, `interpret` returns Proposal ops, and Triage Accept applies them. A new Cap starts with `/create-cap`; naming, layers and the D1–D5 ship decisions are in [`caps-lexicon`](../../docs/reference/platform/caps-lexicon.md).

## Rules

- `run` is an Effect (`CapRun`) whose only vendor error family is `ToolsTag`. `interpret(report, opts)` is pure and synchronous and returns typed `PatchOp`s; an op the union refuses fails the stage and no Proposal is made.
- Caps import no `@watchdog/server/db`, `drizzle-orm`, `postgres` or `pg` (`check:boundaries`). Secrets come from `ctx.getCredential`, the one missing-key failure; a Vault slot's label and description live on the Cap's `credentials` declaration, and a slot several Caps read is one constant in `src/credentials.ts`. A config-only slot sets `secret: false`.
- State a fact once: `flags` holds `slow` / `invasive` only; `needs_key`, `third_party`, the egress classes and the lane derive from `credentials`, `contacts` and the kind. Set `lane` only to override; an `act` Cap runs at most once per Job.
- Every Cap declares `contacts` (`[]` for one that stays on the install). A Job's `Egress` refuses anything the contacts do not admit, on every redirect hop: fix a refusal by correcting the declaration, never the policy. A new Cap adds a case to `src/__tests__/declaration/` and its classes to `cap-egress-classes.test.ts`.
- Every Cap has a `provider` read from the provider's own terms (`commercialUse: "unknown"` when unclear, never a guess), and every fixed host it declares has a reviewed redistribution verdict in that provider's `hosts`. The owner reviews these by hand, quoting the deciding text.
- Set `timeoutMs` on the Cap: it drives abort, expiry and stale reclaim. A Cap that reads user bytes passes `{ maxBytes, reason }` to `ctx.readArtifact`.
- Never hand-edit `capabilities.gen.json` or `docs/reference/platform/cap-register.md`: run `pnpm generate:caps` (the version is a fingerprint of the modules a Cap reaches).
- Every Collect Cap ships `__tests__/interpret.test.ts`. `runCap` is the Promise edge for `run` tests; `createRecordedRun` asserts recorded calls.

## Breach Caps

- A Cap under `breach/` is off until `WD_BREACH_CAPS=safe` or `full`; a new caller of `checkCapabilityAvailability` / `checkPlaybookAvailability` passes `breachCapsEnabled`.
- A breach Cap declares `exportRedaction`, keeps provider bodies hash-only, never quotes or logs a credential (`describeCredential`), and reads vendor responses through a strict allowlist schema so a password, hash or plaintext login never reaches Evidence. In `safe` mode no artifact holds a plaintext password or hash. Watchdog never uses a retrieved credential to log in.
- Paid or quota-spending vendor routes stay out of a client (LeakRadar has no unlock route and never sends `auto_unlock`).

## Layout and Playbooks

- One folder per Cap id, dots to path segments (`network/dns.lookup/{cap,interpret,input}.ts`). Inside this package import the SDK by relative path (Vite does not resolve package self-references); inside `playbooks/` import Caps from `../registry`, not the barrel.
- Collect input seeds use the `*SeedSchema` helpers; interpret emits identifiers normalized like an Identifier write. A batch limit that drops values says so with `identifierTruncationNote`, never a hand-written note.
- Producer Zod lives in `@watchdog/tools/<domain>`: import it, never re-export or retype it.
- A Playbook emits step 0 only; later steps are created once their sources settle, and a failed step skips only its dependents. Playbook ids are kebab-case and start with `seedKinds[0]`. Keep harvest + `extract.ai` and act Caps out of default books.
