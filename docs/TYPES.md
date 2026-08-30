# Types & schemas

Contract layer for Watchdog: shared atoms in `@watchdog/schemas`, domain inputs in `domains/*/types.ts`, package wire (oRPC / Caps / patch) at the edge.

**Not this doc:** UI props styling ([`apps/web/docs/UI.md`](../apps/web/docs/UI.md)), domain folder map ([`apps/web/docs/DOMAINS.md`](../apps/web/docs/DOMAINS.md)).

---

## Package ownership

```
@watchdog/schemas     ← atoms: vocab, JsonValue, PatchOp, EvidenceSnapshot, platforms,
                         normalize-identifier, validate-identifier, fingerprint, job-artifact ids
       ↓
@watchdog/policy      ← assertPatchGates / patchNeedsConfidence (pure; schemas only)
@watchdog/cap-sdk     ← defineCapability SPI + CapDescriptor / toCapDescriptor
                         + CapContext / interpret types (schemas + zod)
@watchdog/tools       ← dumb HTML/DNS/WHOIS/HTTP/Wayback fetch+parse + producer Zod
                         (dns/whois report schemas; prefer no Cap/Graph deps)
@watchdog/ai          ← LLM provider + structuredExtract + ProcessExtractDraft Zod
                         (re-exports EvidenceSnapshot from schemas)
       ↓
@watchdog/db          ← Drizzle columns .$type<>() from schemas; may re-export PatchOp type
@watchdog/caps        ← Cap implementations + registry; CapDescriptor catalog
                         (`listCapabilities` / `capabilities.gen.json`); Zod inputs
@watchdog/core        ← parsePatch / tryParsePatch; blob; pack EvidenceSnapshot;
                         run-job + run-paths; apply-patch + apply-*-op / edge-update
                         (no policy re-exports; `MAX_UPLOAD_BYTES` is the one
                          schemas value re-exported, via infra/blob.ts)
@watchdog/api         ← oRPC procedure I/O (composes schemas atoms)
@watchdog/client      ← generated OpenAPI contract + createWatchdogClient (CLI/agents)
@watchdog/cli         ← `wd` over client (+ authenticated file fetch for Case Export)
apps/web domains      ← types.ts: domain mutation Zod + DTOs (import schemas atoms;
                         do not re-export vocab)
```

| Lives in | Examples |
| --- | --- |
| `@watchdog/schemas` | `CONFIDENCE_TIERS`, `GRAPH_WRITE_CHANNELS`, `TASK_STATUSES` / `TASK_PRIORITIES`, `PLAYBOOK_SEED_KINDS`, `HANDOFF_BAGS` / `JobHandoff`, `OPEN_JOB_STATUSES` / `isOpenJobStatus`, `PLAYBOOK_RUN_STATUSES`, `patchOpSchema` / `PatchOp`, `evidenceSnapshotSchema`, `IDENTIFIER_PLATFORMS`, `normalizeIdentifier*` / `validateIdentifierWrite` / `listInvalidIdentifierOps`, `fingerprint*`, Cap/Job artifact ids (`REPORT_JSON_ARTIFACT`, `isJobInternalArtifact`, `EVIDENCE_HARVEST_CAPABILITY_ID`, …) |
| `packages/api` | `jobSchema` (`playbookFanIndex`, `playbookRunStatus`), `proposalSchema`, `graphWriteResultSchema` (compose atoms) |
| `@watchdog/policy` | `assertPatchGates`, `assertPatchShape`, `patchNeedsConfidence` |
| `@watchdog/ai` | `processExtractDraftSchema`, `llmProviderConfigSchema`, `createWatchdogModel`, `structuredExtract` (LLM + extract only — not Job persistence policy) |
| `domains/{noun}/types.ts` | `createClaimInputSchema`, `ClaimRecord` |
| `packages/api` | `jobSchema` (`playbookFanIndex`, `playbookRunStatus`), `proposalSchema`, `graphWriteResultSchema` (compose atoms) |
| Cap folder `input.ts` | Runtime Zod Cap inputs colocated with each Cap (`host` + optional `entityId`, …) |
| `@watchdog/tools` (producer Zod) | DNS/WHOIS/oEmbed report shapes: `dnsRecordsSchema` / `whoisSnapshotSchema` / `oembedSnapshotSchema` (+ inferred types) next to fetch/parse — single SoT |
| Cap folder `report-schema.ts` | Re-exports tools producer Zod for Collect Caps; `interpret` / Cap `safeParse` import from here (do not redefine shapes) |
| `@watchdog/cap-sdk` CapDescriptor | Serializable catalog + `input` / `inputForm` JSON Schema (`pnpm generate:caps`) |
| `@watchdog/caps` (Process lib) | `evidence/lib/draft-to-patch-ops`, `process-shared` (`uploadProcessArtifacts`, …) |
| `@watchdog/caps` (harvest) | `evidence/harvest/harvest.ts` (`harvestDeterministic`); `quote-strip.ts` masks IPB/phpBB quoted spans (text after the quote still harvests); `extractors/` (`HARVEST_EXTRACTORS` — quotes, URLs+filename forensics, searchable selectors). Harvest does **not** emit “run oEmbed” Questions. |
| `@watchdog/caps` (Collect shared) | `lib/collect/` — `define-collect-cap.ts`, `upload-json-report-pair.ts`, `interpret-observation-claim.ts`, `interpret-identifier-batches.ts` (`interpretTypedIdentifiers` thin re-export), `interpret-whois-snapshot.ts` (Claim + optional near-expiry Event; no NS Identifiers); per-Cap `interpret.ts` |
| `@watchdog/core` | Exported from the barrel: `parsePatch` / `tryParsePatch`; `applyPatch`; `updateQuestion` / `reopenQuestion`; `loadCapReport`; `parseAgentPatch`; `createAgentProposal` / `writeGraphFromAgent`. Internal (import by path, not from the package root): `graph/apply-*-op.ts`; `edge-update.ts` (`validateEdgeUpdate`, `buildEdgePatch`); `identifier-collisions.ts` (Triage warn); `questions.ts` `seedDefaultQuestions` (person seeds on Entity create); `jobs/run-paths.ts` |

---

## Platform vocab is the only vocab here

`@watchdog/schemas` is the sole vocabulary SoT in this repo, covering Postgres, Caps, Triage and UI. Confidence is `unverified` | `possible` | `confirmed`.

The separate investigation vault keeps its own markdown vocabulary in a private repo, including tiers such as `probable` that the platform deliberately does not have. Overlap (predicates, kinds) is intentional but not identical, so do not port values between them by assuming the names line up.

### Platform edge predicates

SoT: `EDGE_PREDICATES` + `EDGE_PREDICATE_META` in [`packages/schemas/src/vocab.ts`](../packages/schemas/src/vocab.ts).

**Doctrine:** one directed Postgres row (`from_id` → `to_id`). Inverse labels are display metadata (`inverseLabel`), not a second stored predicate or Wikidata-style dual statement. Prefer **dependent → provider** for infra topology (`hosted_on`, `dns_via`, `mail_via`, `resolves_to`).

| Predicate | Meaning (A → B) | Inverse label (from B) | Symmetric |
| --- | --- | --- | --- |
| `operates` | A runs/administers B | operated by | no |
| `owns` | A owns B | owned by | no |
| `hosted_on` | A is hosted on B | hosts | no |
| `leads` | A leads B | led by | no |
| `founded` | A founded B | founded by | no |
| `registers` | A (registrant) registered B | registered by | no |
| `member_of` | A is member of B | has member | no |
| `parent_of` | A is parent of B | child of | no |
| `primary_domain` | A’s primary domain is B | primary domain of | no |
| `resolves_to` | A resolves to B | resolved from | no |
| `dns_via` | A uses DNS via B | serves DNS for | no |
| `mail_via` | A uses mail via B | serves mail for | no |
| `associate_of` | known association | associate of | yes |
| `same_as` | same real-world entity | same as | yes |
| `suspected_as` | A suspected sock/alias of B | suspected identity of | no |
| `shares_ip_with` | shared IP / co-host signal | shares IP with | yes |
| `related_to` | weak/other (notes required) | related to | yes |

`predicateLabel(predicate, "out" \| "in")` picks `label` vs `inverseLabel`. UI create framing uses a combined phrase picker `{predicate, orientation}` (`edgePhraseOptions` / `parseEdgePhraseValue`); form SoT is predicate+orientation — phrase strings are only a FieldCombobox encoding. Both create and update send absolute `fromId`/`toId` (via `resolveEdgeEndpoints`). Caps/CLI pass explicit endpoints. Core rejects kind pairs outside `validKinds`.

**Phrase groups (UI):** each meta has `group: EdgePredicateGroup` (`EDGE_PREDICATE_GROUPS` / `EDGE_PREDICATE_GROUP_LABELS`). Combobox headings are semantic (both orientations under one group): Ownership & Control · Roles & Affiliation · Identity · Domains & Hosting · Registration & Services · Other. Naming is **`group`**, not `family`.

**Smart default / clamp (web):** `preferredEdgePhrase(centerKind, peerKind)` — org↔infra → `primary_domain`; org↔org / infra↔infra → `parent_of`; else first valid option. `clampEdgePhrase` keeps the current phrase when still valid for the kind pair, otherwise falls back to preferred.

**Updates:** Dossier/API edge edits validate via `packages/core/src/graph/edge-update.ts` (`validateEdgeUpdate` → `buildEdgePatch` → `applyValidatedEdgeUpdate`).

**Handles:** `type === "handle"` requires non-empty `platform` (normalized via `normalizeIdentifierPlatform`) — enforced in core on both Dossier create/update (`identifiers.ts`) and Triage Accept (`apply-identifier-op.ts`), and in bulk-add paste resolve (not only in the UI). Harvest and `web.media.oembed` canonicalize values with a leading `@`.

**Identifier value validation:** `validateIdentifierWrite` in `@watchdog/schemas` (normalize + soft-strict shape + handle→platform). Core create / update / Accept gate with `DomainError("invalid", …)`. Soft types (`handle`, `crypto`, `credential`, `other`) are non-empty trim only; type-only updates re-validate under the new type. Triage preflight: `listInvalidIdentifierOps`.

| Type | Reject when (after normalize unless noted) |
| --- | --- |
| `email` | `@` count ≠ 1; empty local/domain; spaces; domain missing `.` |
| `phone` | raw has letters (beyond leading `+`); or digit length ∉ 7–15 |
| `url` | `new URL()` fails or protocol not `http:`/`https:` |
| `domain` | spaces / `/` / `://`; no dot; empty label; not hostname-shaped (underscore labels OK) |
| `ip` | not valid IPv4/IPv6 syntax (pure JS; no public/private range check) |
| `pgp` | hex length ∉ `{8,16,40,64}`; or armor not `-----BEGIN PGP …` |
| soft | empty after trim only |

**Domains:** `type === "domain"` is a hostname/FQDN Identifier (CT / subdomain Caps). Normalized via `normalizeIdentifierValue` (lowercase, strip scheme/path/`*.` prefix); gated via `validateIdentifierWrite`. Not an Entity by itself — attach to an Entity via Proposal Accept.

**IPs:** `type === "ip"` is an IPv4/IPv6 Identifier (DNS A/AAAA, harvest) — syntax only, not public-range enforced. Normalized via `normalizeIdentifierValue` (trim, strip `[brackets]`, lowercase IPv6 hex). Lives on the seed Entity — Caps do not auto-create infra Entities or `resolves_to` edges. DNS NS/MX stay in the observation Claim, not as Identifiers.

**Triage collisions:** `ProposalRecord.identifierCollisions` is a list annotation (same `type+value` on another Entity). Core indexes `identifiersRepo.listForCase`. Warn in Triage; Accept still allowed. Invalid Identifier values (`listInvalidIdentifierOps` + core write gate) **block** Accept.

**List DTOs:** `EdgeRecord` from `listEdgesForEntity` includes ego-relative `direction`, `peerId`, `peerName`, `peerSlug`, and **`peerKind`** (for canvas/node chrome without a second entities join).

**Vault → platform mapping** (dual wiki fields collapse to one edge):

| Vault field         | Platform                                        |
| ------------------- | ----------------------------------------------- |
| `operates::`        | `operates` (forward)                            |
| `operated_by::`     | `operates` (inbound view / inverse label)       |
| `hosted_on::`       | `hosted_on`                                     |
| `dns_via::`         | `dns_via`                                       |
| `serves_dns_for::`  | `dns_via` inverse label                         |
| `mail_via::`        | `mail_via`                                      |
| `serves_mail_for::` | `mail_via` inverse label                        |
| `domain::`          | `primary_domain` (**forward**)                  |
| `parent_org::`      | `parent_of` (inbound / inverse of parent→child) |
| `possible_sock::`   | `suspected_as`                                  |
| `shared_ip_with::`  | `shares_ip_with`                                |

`registers` means **registrant registered domain** (person/org → infra), not registrar-as-company (use `operates` / `owns`).

---

## Foundations

1. **Schema is SoT** — define `fooSchema`, then `type Foo = z.infer<typeof fooSchema>` (or `z.output`). Never twin a hand `interface` that can drift from the object schema.
2. **`z.input` when input ≠ output** — `.default()`, `.transform()`, `.coerce`. Forms/wire use input; handlers after `.validator` see output.
3. **Validate once** at the trust edge: `createServerFn().validator(schema)`, oRPC `.input`, Cap `input`, `parsePatch`. No re-parse of the same payload inside helpers.
4. **Closed sets** — `z.enum(CONST)` over `as const` arrays from `@watchdog/schemas`. Never copy string literals into a second `z.enum([...])`.
5. **Compose atoms** — domain/api objects import shared fields; use `.pick` / `.omit` / `.partial` / spread. Avoid deprecated Zod `.merge()`.
6. **No `z.any()`**; coerce only at form/query edges (not JSON RPC by default).
7. **Outputs** (server-built rows): plain TS types OK. Zod-parse responses only when data is untrusted.

### Zod package rules

- `@watchdog/schemas` lists `zod` as **peerDependency** (+ devDependency for typecheck). Consumers depend on `zod` themselves.
- One Zod version workspace-wide (`pnpm-workspace.yaml` `overrides`, currently `^4.4.3`). Dual instances break `instanceof` / registry.
- Author with `import { z } from "zod"` (Classic). Do not author product schemas against `zod/v4/core` (that subpath is for libraries that _accept_ foreign schemas).
- Naming: `fooSchema` + `Foo` / `FooInput` (match api style). Const arrays: `SCREAMING_SNAKE`.

---

## File map (web)

| File | Contents |
| --- | --- |
| `domains/{noun}/types.ts` | DTOs + input Zod schemas (may import schemas atoms to compose; do **not** re-export vocab) |
| `domains/{noun}/*.functions.ts` | `createServerFn` + `.validator(schema)` — no hand `parse*`; no vocab re-exports |
| `domains/{noun}/*.server.ts` | DB / secrets; business rules (e.g. confirmed ⇒ evidence) |

Import DTOs/schemas from `@/domains/{noun}/types`. Import product vocab consts/types from `@watchdog/schemas` directly.

---

## Layer table

| Layer | Mechanism |
| --- | --- |
| UI picker options | Const arrays from `@watchdog/schemas` (not via domain re-export) |
| Web RPC | Zod in `types.ts` → `.validator(schema)` |
| HTTP / agents | oRPC in `packages/api` |
| Cap run | Cap `input.ts` Zod for Job input; Collect Caps: `safeParse` via Cap-local `report-schema.ts` (re-export of `@watchdog/tools` producer Zod) before `interpret` |
| Patch wire | `@watchdog/schemas` (`patchOpSchema`); parse via `@watchdog/core` (`tryParsePatch` / `parseAgentPatch`) |
| Identifier create/update/Accept | `validateIdentifierWrite` (value shape + handle→platform) — enforced in `@watchdog/core` |
| Triage identifier collisions | Core annotates Proposals; named `identifierCollisionSchema` on `proposalSchema` — warn, don’t block |
| Triage invalid Identifier ops | Schemas `listInvalidIdentifierOps` + core write gate — **block** Accept |
| Custody gates | `@watchdog/policy` (`assertPatchGates` / `assertPatchShape`) |
| Agent Graph write | oRPC `graph.write` + CLI `wd graph write`; audit table `graph_writes` |
| Child Graph writes (CLI) | `wd` claims / identifiers / edges / events / questions + `--user-override`; refuse `confirmed` |
| Cap credentials (API/CLI) | oRPC `/credentials` + `wd credentials` (slots only; never plaintext) |
| Persistence | Drizzle `.$type<VocabType>()` from schemas |

---

## Anti-patterns

- Importing product enums from `@watchdog/db` (or a resurrected `@watchdog/db/vocab`)
- Treating `PatchOp` / `EvidenceSnapshot` as owned by `db` or `ai` (schemas is SoT; others re-export)
- Hand-rolled `z.enum(["queued", …])` that drifts from `JOB_STATUSES`
- `parse*` / `assertConfidence` in `*.functions.ts` instead of Zod
- Freestyle confidence/predicate strings in dossier pickers
- Re-exporting product vocab from domain `types.ts` / `*.functions.ts` (UI imports `@watchdog/schemas`)
- Dumping every procedure DTO into `@watchdog/schemas` (keep the package thin — atoms only)
- Nesting a second Zod copy inside `@watchdog/schemas` `dependencies`
- Duplicating Collect Cap report shapes as TS interfaces in Caps when tools already exports producer Zod (`dnsRecordsSchema` / `whoisSnapshotSchema` / `oembedSnapshotSchema`)
- Syncing vault `probable` into platform without an explicit product decision

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
