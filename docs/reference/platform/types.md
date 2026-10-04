# Types & schemas

Contract layer for Watchdog: shared atoms in `@watchdog/schemas`, domain inputs in `domains/*/types.ts`, package wire (oRPC / Caps / patch) at the edge.

**What this is not:** a copy of the vocabulary. Enums, predicates and validation rules live in code; this page says who owns what and which rules apply when you add a schema.

## Package ownership

```
@watchdog/schemas   atoms: vocab, JsonValue, PatchOp, EvidenceSnapshot, platforms,
                    normalize/validate-identifier, fingerprint, job-artifact ids
      ↓
@watchdog/policy    assertPatchGates / patchNeedsConfidence (pure; schemas only)
@watchdog/caps/sdk  defineCapability SPI + CapDescriptor
@watchdog/tools     fetch/parse helpers + producer Zod (dns/whois/oembed reports)
@watchdog/ai        LLM provider + structuredExtract + ProcessExtractDraft Zod
      ↓
@watchdog/db        Drizzle columns .$type<>() from schemas; may re-export the PatchOp type
@watchdog/caps      Cap implementations + registry; Zod inputs; capabilities.gen.json
@watchdog/core      parsePatch / tryParsePatch; EvidenceSnapshot packing; run-job; apply-patch
@watchdog/api       oRPC procedure I/O (composes schemas atoms)
@watchdog/client    generated OpenAPI + minified router JSON + createWatchdogClient
apps/web domains    types.ts: domain mutation Zod + DTOs (import atoms; do not re-export vocab)
```

Where to find things:

| Need | File |
| --- | --- |
| Enums, confidence tiers, task/job/playbook vocab, edge predicates + metadata (`EDGE_PREDICATES`, `EDGE_PREDICATE_META`) | [`packages/schemas/src/vocab.ts`](../../../packages/schemas/src/vocab.ts), `enums.ts` |
| `PatchOp` / `patchOpSchema` (incl. the rule that claim/identifier/edge ops carry no `confidence`) | [`packages/schemas/src/patch.ts`](../../../packages/schemas/src/patch.ts) |
| Identifier value rules per type (email, phone, url, domain, ip, pgp; soft types), handle→platform | [`packages/schemas/src/validate-identifier.ts`](../../../packages/schemas/src/validate-identifier.ts), `normalize-identifier.ts`, `platforms.ts` |
| Cap/Job artifact id constants, `isJobInternalArtifact` | `packages/schemas/src/job-artifacts.ts` |
| Accept gates | `@watchdog/policy` (`assertPatchGates`, `assertPatchShape`) |
| Patch application | `packages/core/src/graph/patch/apply-*-op.ts`, `parse-agent-patch.ts` |
| Edge update validation | `packages/core/src/graph/edge-update.ts` |
| Producer report shapes | `@watchdog/tools` (`dnsRecordsSchema`, `whoisSnapshotSchema`, `oembedSnapshotSchema`); a Cap's `report-schema.ts` re-exports them |

## Platform vocab is the only vocab here

`@watchdog/schemas` is the sole vocabulary SoT in this repo, covering Postgres, Caps, Triage and UI. Confidence is `unverified` | `possible` | `confirmed`. The separate investigation vault keeps its own markdown vocabulary in a private repo, including tiers such as `probable` that the platform deliberately does not have; overlap is intentional but not identical, so do not port values between them by assuming the names line up.

### Domain notes (rules not visible from the enums)

- **Edges:** one directed Postgres row (`from_id` → `to_id`). Inverse labels (`inverseLabel`) are display metadata, not a second stored predicate. Prefer **dependent → provider** for infra topology (`hosted_on`, `dns_via`, `mail_via`, `resolves_to`). `registers` means registrant registered domain (person/org → infra), not registrar-as-company. Both create and update send absolute `fromId`/`toId`; core rejects kind pairs outside `validKinds`; `related_to` requires notes.
- **Identifiers:** values are normalized then validated by `validateIdentifierWrite`; invalid values block Accept and core create/update, collisions only warn ([`../contracts/custody.md`](../contracts/custody.md)). `handle` requires a non-empty `platform`. `domain` and `ip` are Identifiers on the seed Entity, not Entities; Caps do not auto-create infra Entities or `resolves_to` edges; `ip` is syntax-checked only (no public-range enforcement). DNS NS/MX stay in the observation Claim.
- **`EdgeRecord` list DTOs** carry ego-relative `direction`, `peerId`, `peerName`, `peerSlug` and `peerKind`.

---

## Foundations

1. **Schema is SoT**: define `fooSchema`, then `type Foo = z.infer<typeof fooSchema>` (or `z.output`). Never twin a hand-written `interface` that can drift.
2. **`z.input` when input ≠ output** (`.default()`, `.transform()`, `.coerce`): forms and wire use input; handlers after `.validator` see output.
3. **Validate once** at the trust edge: `createServerFn().validator(schema)`, oRPC `.input`, Cap `input`, `parsePatch`. No re-parse inside helpers.
4. **Closed sets**: `z.enum(CONST)` over `as const` arrays from `@watchdog/schemas`. Never copy string literals into a second `z.enum([...])`.
5. **Compose atoms**: domain/api objects import shared fields; use `.pick` / `.omit` / `.partial` / spread. Avoid deprecated `.merge()`.
6. **No `z.any()`**; coerce only at form/query edges.
7. **Outputs** (server-built rows): plain TS types are fine; Zod-parse responses only when data is untrusted.

Enforced: one Zod version via the `zod` entry in the pnpm catalog and `overrides` in `pnpm-workspace.yaml`. Rules 1-7 and the naming/import rules below are **guidance** (review); oxlint's typescript rules catch some but no gate checks them.

### Zod package rules

- `@watchdog/schemas` lists `zod` as a **peerDependency** (+ devDependency for typecheck); consumers depend on `zod` themselves.
- One Zod version workspace-wide (dual instances break `instanceof` / registry).
- Author with `import { z } from "zod"` (Classic), not `zod/v4/core`.
- Naming: `fooSchema` + `Foo` / `FooInput`; const arrays `SCREAMING_SNAKE`.

### File map (web)

| File | Contents |
| --- | --- |
| `domains/{noun}/types.ts` | DTOs + input Zod schemas (may import atoms; do **not** re-export vocab) |
| `domains/{noun}/*.functions.ts` | `createServerFn` + `.validator(schema)`: no hand `parse*`, no vocab re-exports |
| `domains/{noun}/*.server.ts` | DB / secrets; business rules |

Import DTOs/schemas from `@/domains/{noun}/types`; import product vocab from `@watchdog/schemas` directly.

---

## Anti-patterns

- Importing product enums from `@watchdog/db`
- Treating `PatchOp` / `EvidenceSnapshot` as owned by `db` or `ai` (schemas is SoT; others re-export)
- Hand-rolled `z.enum(["queued", …])` that drifts from `JOB_STATUSES`
- `parse*` / `assertConfidence` in `*.functions.ts` instead of Zod
- Freestyle confidence/predicate strings in dossier pickers
- Re-exporting product vocab from domain `types.ts` / `*.functions.ts`
- Dumping every procedure DTO into `@watchdog/schemas` (atoms only)
- A second Zod copy inside `@watchdog/schemas` `dependencies`
- Duplicating Collect Cap report shapes as TS interfaces when tools already exports the producer Zod
- Syncing vault `probable` into the platform without an explicit product decision

---

## Quick example

```ts
// domains/entities/claims/types.ts
import { z } from "zod";
import {
  claimClassSchema,
  confidenceTierSchema,
  nonEmptyTrimmed,
  uuidListSchema,
  uuidSchema,
} from "@watchdog/schemas";

export const createClaimInputSchema = z.object({
  caseId: uuidSchema,
  entityId: uuidSchema,
  text: nonEmptyTrimmed,
  confidence: confidenceTierSchema,
  class: claimClassSchema.default("observation"),
  evidenceIds: uuidListSchema.optional(),
});
/** Wire / form payload (class optional before default). */
export type CreateClaimInput = z.input<typeof createClaimInputSchema>;
/** After validator parse (class always present). */
export type CreateClaimParsed = z.output<typeof createClaimInputSchema>;
```

```ts
// claims.functions.ts
.validator(createClaimInputSchema)
// handler data: CreateClaimParsed → createClaim(data)
```
