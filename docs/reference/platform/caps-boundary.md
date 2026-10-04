# Caps boundary, credentials, Intake, Export

**What this is:** Cap SPI vs catalog, credentials, the Intake path, Case Export.  
**What this is not:** Cap id lexicon / D1-D5 ([`caps-lexicon.md`](caps-lexicon.md)), package matrix ([`packages.md`](packages.md)), agent writes ([`../contracts/agent-ingress.md`](../contracts/agent-ingress.md)), identifier collision and invalid-value rules ([`../contracts/custody.md`](../contracts/custody.md)).

## Caps (boundary)

Layering: **SPI** (`@watchdog/caps/sdk`, `packages/caps/src/sdk/`: `defineCapability`, `CapDescriptor` / `toCapDescriptor`, CapContext) is not the **catalog** (`@watchdog/caps`: implementations, registry, playbooks), which is not **tools** (`@watchdog/tools`: dumb helpers with no PatchOp / Graph / Cap types, including producer Zod for DNS/WHOIS/oEmbed reports). Runtime consumers (core, api, web) import the catalog from `@watchdog/caps`; `core` imports the SPI from `@watchdog/caps/sdk`; Cap code inside `packages/caps` uses relative paths. Guidance backed by dependency declarations ([`packages.md`](packages.md)): caps declares no `db` dependency (nothing fails if one is added), and `CapContext` has no DB handle (a type).

- Author only through `defineCapability` / `defineCollectCap` (`packages/caps/src/lib/collect/`), **one folder per Cap** (`network/dns.lookup/`, `evidence/harvest/`; layout in [`packages/caps/AGENTS.md`](../../../packages/caps/AGENTS.md)). Collect Caps call tools helpers from `run`, `safeParse` with the `@watchdog/tools` schemas imported directly from `@watchdog/tools/<domain>`, and map to patches in `interpret.ts`. Do not redefine producer shapes as TS interfaces.
- **`CapDescriptor`** is the serializable projection of a Cap (no `run` / `interpret`): identity, kind/flags/egress, consumes/produces, credential names, jobPolicy, and Zod-to-JSON-Schema `input` / `inputForm`. `listCapabilities()` returns descriptors for Jobs, CLI and agents. The committed artifact `packages/caps/capabilities.gen.json` comes from `pnpm generate:caps`; never hand-edit. Enforced: CI "CapDescriptor drift" and `capabilities-gen.test.ts`.
- **`run`** returns artifact metadata `{ name, mime, uri, sha256 }[]` only: no Graph writes, no absolute paths, no inline bytes. Durable bytes go through `ctx.uploadArtifact`. CapContext for `run`: `input`, `caseId`, `jobId`, `signal`, `uploadArtifact`, `readArtifact`, `scratchDir`, `getCredential`, `hasCredential`, `allowThirdPartyEgress`, `log`, optional `evidenceSnapshot`.
- **`interpret(report, opts)`** is optional and pure: `{ patch, summary? }`, with no CapContext or I/O. Core loads the canonical `report.json` and the worker creates the **Proposal** (the patch is not stored on the Job). Process Caps get a packed **EvidenceSnapshot** before `run`; no live Graph reads.
- **`timeoutMs`** (default `DEFAULT_CAP_TIMEOUT_MS`, 120s) is the only place to set timing. It drives `ctx.signal` (the Job fiber's `AbortSignal`), pg-boss `expireInSeconds`, the worker graceful-stop window and stale-`running` reclaim (`capTimeoutMs` in `caps/src/sdk/define.ts`, `capTimeoutCeilingMs` in `caps/src/registry.ts`, `POST_RUN_SLACK_MS` in `core/src/jobs/timeouts.ts`). Guidance: do not hardcode derived timings elsewhere.
- **`jobPolicy`** holds declarative runner hooks: `needsEvidenceSnapshot`, `linkEvidenceFromInput`, `markEvidenceProcessed`, `cacheTtlMs` (ignored for `kind: "act"`). Keep Cap taxonomy out of `executeJob`.
- **`egress`** is `"none"` (default) or `"third_party"`; a third-party Cap is refused in `executeJob` unless `Case.allowThirdPartyEgress`.
- **`interpret` failure:** the Job stays `succeeded` with its artifacts; `jobs.interpretError` is set and no Proposal is created.
- **Finding suppression:** before Proposal insert, core drops ops already on the Graph or previously Rejected (fingerprints) and records `jobs.suppressed_count` / `proposals.suppressed_count`. Cache hits set `jobs.from_cache`. Cap `resultSummary` and Proposal `summary` stay Cap-owned prose; do not concatenate "all known" into them.
- **Job-internal artifacts** (`isJobInternalArtifact` and the id constants in `@watchdog/schemas` `job-artifacts`: `report.json`, `evidence-snapshot.json`, `derived.json`, enrich `live.*` / `enriched.md` / `links.json`) never become Case Evidence rows; they stay on the Job `output`.
- **Playbooks are user-initiated.** A Playbook run starts only from an explicit user action in Collect, never automatically from a dump or an Evidence landing (`guidance`: no test asserts it). Only step 0 is queued at start; later steps are created as each Job succeeds.
- LLM helpers live in `@watchdog/ai` (provider + `structuredExtract` + draft Zod); `draftToPatchOps` stays in `@watchdog/caps`. Prompts are Cap-local.

## Cap credentials

Settings stores Cap secrets encrypted (AES-256-GCM) under `WD_MASTER_VAULT_KEY` (required, non-empty, validated by `@watchdog/env/server`; format in `vault.ts`). The same vault is exposed to agents via oRPC `GET|PUT|DELETE /credentials` and `wd credentials` (never returns plaintext; put via `--stdin` / `--secret-env`). Known slot names: `KNOWN_CREDENTIALS` in `packages/caps/src/known-credentials.ts`.

Rules:

- Caps load secrets only through `ctx.getCredential(name)`. Never read `process.env` for Cap secrets; never put them in `Job.input`, Export or logs. Enforced for declared credentials by fail-closed specs at `startJob` / playbook start and in worker preflight; guidance for everything else (no lint on `process.env` in caps).
- Deploy/boot vars use `env.*` from `@watchdog/env/server`. The CLI parses `WD_API_*` itself in `loadCliEnv()` (lazy, so `wd --help` works without a key).
- **Rotating or losing `WD_MASTER_VAULT_KEY` makes existing ciphertext unreadable.** `just wipe` keeps `auth` and vault rows. Generate the key with `openssl rand -base64 32` or `openssl rand -hex 32` (see `env.example`) and restart web and worker after changing it.

`CapabilityDef.credentials` is a list of specs:

| Spec | Meaning |
| --- | --- |
| `{ name }` | Required: the Job fails closed if missing |
| `{ name, optional: true }` | Present-or-skip |
| `{ anyOf: [a, b, …] }` | At least one name must be set (e.g. AI Process providers) |

Process AI resolves `ANTHROPIC_API_KEY` or `AI_COMPAT_API_KEY` (+ optional `AI_COMPAT_BASE_URL`) at run time through these specs.

## Intake

Path: **Dump → Enrich (URL) → Process → Triage Accept** (a human sets confidence).

- **Process** → Cap Job `evidence.harvest` (deterministic) or `evidence.extract.ai` (LLM). Core packs an **EvidenceSnapshot** (falling back to the Enrich Job's `enriched.md` for URL-only dumps), the Cap fills a **ProcessExtractDraft**, `interpret` yields a **Proposal** when an Entity is attached. `processedAt` is set when interpret says so (a Proposal, or an empty extract with text present), not when the signal needs an Entity or a URL dump still has no text (Enrich first). OpenAPI `evidence.process` / `wd evidence process` (`--ai` for extract) run the same glue.
- **Enrich** (URL dumps) → Cap Job `network.url.enrich` (live + Wayback). Run-only: no `interpret`, no Proposal. Intake glue `enrichUrlEvidence` reads `sourceUrl` and starts the Job (`evidence.enrich` / `wd evidence enrich`). Markdown pipeline: prefer `Accept: text/markdown` from the origin, else local HTML-to-md; do **not** proxy investigation URLs through `markdown.new` (OPSEC; guidance). Artifacts stay on the Job; `enriched.md` is page prose plus `## Outbound links` with a `links.json` sidecar.
- **File dump:** client SHA-256 → `presignUploadFn` → PUT to object storage → `confirmFileUploadFn` (HeadObject verify → Evidence). Same loop via OpenAPI (`evidence.presign` / `confirmFile`) and `wd evidence file`. Paste hashes server-side via `uploadArtifact`. Max 100 MB per file (`MAX_UPLOAD_BYTES` in `@watchdog/schemas`). If confirm fails, the uploaded object stays in the bucket as an orphan with no Evidence row. A URL dump is metadata only until Enrich.
- Lexicon: **Collect** = dump + Cap/Job runs (`/collect`); **Triage** = the Accept gate (`/triage`). Do not compound "Intake Process" as a type.

## Case Export

The worker and API write a live markdown shadow under `export/<organization-id>/<case-slug>/` (override with `WD_EXPORT_DIR`). The directory is gitignored and regenerable: a projection, not the SoT (case slugs are unique per organization; a pre-multi-org `export/<case-slug>/` folder is stale). A Case rename regenerates the slug and best-effort renames the directory, then `scheduleCaseExportEffect`. Agents use the authenticated file routes `GET …/cases/{id}/export.zip` and `…/entities/{slug}/export.md` via `wd export zip|md`. Details: `@watchdog/core` `infra/export-sync`.

## Controlled vocab

Platform enums, identifier platforms, identifier validation, `PatchOp`, `EvidenceSnapshot`, fingerprints and Cap/Job artifact id constants live in `@watchdog/schemas`. UI and domain code import them from there directly; do not re-export through `domains/*/types.ts` or `*.functions.ts` (guidance). Ownership map: [`types.md`](types.md).
