# Architecture — Watchdog platform

**What this is:** package layout, import direction, Cap/Collect/Triage/Export data path, oRPC boundary.  
**Not:** TanStack Start chrome or Query/SSE wiring — that is [`apps/web/docs/ARCHITECTURE.md`](../apps/web/docs/ARCHITECTURE.md) · [`DATA.md`](../apps/web/docs/DATA.md).

## Monorepo packages

`apps/*` + `packages/*`: `@watchdog/env` (T3 Env boot secrets), `@watchdog/db` (Drizzle + events), `@watchdog/schemas` / `@watchdog/policy` / `@watchdog/ai`, `@watchdog/cap-sdk` / `@watchdog/caps` / `@watchdog/tools`, `@watchdog/core`, `@watchdog/log` (evlog process logs), `@watchdog/api` (oRPC), `@watchdog/client`, `@watchdog/cli` (`wd`), `apps/worker` (pg-boss).

### Package import direction (forbidden imports)

| Package | May depend on | Must not import |
| --- | --- | --- |
| `@watchdog/env` | (nothing in-workspace) | db, caps, core, api, apps, schemas, … |
| `@watchdog/schemas` | (nothing in-workspace) | db, caps, core, api, apps, tools, cap-sdk, policy, env |
| `@watchdog/policy` | schemas | db, caps, core, api, apps, tools, cap-sdk, ai |
| `@watchdog/db` | schemas, **env** (runtime); drizzle-kit via dotenv — see [`packages/db/AGENTS.md`](../packages/db/AGENTS.md). Owns **schema + `repos`** (SQL only). | caps, core, api, apps |
| `@watchdog/ai` | schemas | db, caps, core |
| `@watchdog/cap-sdk` | schemas | db, caps, core, api, apps, tools |
| `@watchdog/tools` | schemas (only if needed; prefer zero) | db, caps, core, ai, cap-sdk, api, apps |
| `@watchdog/caps` | schemas, ai, **cap-sdk**, **tools** | **db**, core, api, apps |
| `@watchdog/core` | db (**repos only** — no `drizzle-orm`), caps, cap-sdk, schemas, **policy**, **env**, **log** | api, apps — layout: `jobs/` · `cases/` · `proposals/` (Triage accept/reject) · `graph/` (entity services + `graph/patch/` apply pipeline) · `tasks/` · `search/` · `activity/` · `evidence/` · `infra/`; worker imports `@watchdog/core/worker` |
| `@watchdog/log` | (nothing in-workspace; pin `evlog`) | apps, cli, client, core, api, db, caps, … |
| `@watchdog/api` | core (+ schemas), **caps** (catalog descriptors only), **log** (`ApiContext.log?`) | apps, **db**, drizzle-orm |
| `@watchdog/client` | api (**types only** at import) + minified contract JSON | apps, db, caps, core, **log** |
| `@watchdog/cli` | client + env/cli + schemas | core, db, api, apps, **log** |
| `apps/*` | api / core / caps / schemas / **env** / **log** as needed | web must not import **db** except `auth/server.ts` + SSE `routes/api/events.ts` |

`PatchOp` and `patchOpSchema` live in **`@watchdog/schemas`** so Caps never depend on Drizzle. `EvidenceSnapshot` also lives in schemas (re-exported from `@watchdog/ai` for Process helpers). Accept / apply-patch custody (`assertPatchGates`, `patchNeedsConfidence`) lives in **`@watchdog/policy`** — pure, DB-free; import policy/schemas directly (do not re-export through core).

## Jobs path

Enqueue: `enqueueCapJob` → pg-boss queue `watchdog.cap-jobs` → `apps/worker` runs Cap → Evidence + Proposal → Triage Accept/Reject (one TX). Collect lists jobs via `JobListRecord` (no `logs`); run detail loads full `JobRecord` via `getJobForCase`.

One boss per process: web/API via `enqueueCapJob` / `ensureBossProducer()` (`supervise: false`); worker via `ensureBossWorker()` (`supervise: true`) — playbook chain reuses the live worker boss. Cap `timeoutMs` drives abort, per-job expire, graceful stop, and stale-Job reclaim (see package AGENTS Gotchas). Export shadow sync: worker listens for graph events → `scheduleCaseExport` (coalesced in `@watchdog/core`).

**Capability ids** — three segments `<category>.<salient_axis>.<method>` (ADR-045). File path mirrors the id under `packages/caps/src/`. Lexicon, method vocabulary, D1–D5 decisions, and ship gates: [`CAPS.md`](CAPS.md).

## oRPC

- Router: `packages/api` (`@watchdog/api`) — Zod procedures; business logic in `@watchdog/core`; SQL in `@watchdog/db` `repos`.
- **RPC (web):** `apps/web` `src/routes/api/rpc.$.ts` → `RPCHandler` prefix `/api/rpc`.
- **OpenAPI (agents/CLI):** `apps/web` `src/routes/api/v1.ts` + `v1.$.ts` → `OpenAPIHandler` prefix `/api/v1`.
  - Spec: `GET /api/v1/spec.json`
  - Scalar: `GET /api/v1/`
  - Security schemes: Bearer, **`apiKeyAuth` (`x-api-key`)**, session cookie — `@watchdog/client` / `wd` send `x-api-key`.
- Auth context: Better Auth session → `ApiActor`. Optional `ApiContext.log` from Start ALS (`peekRequestLogger`) — present for HTTP handlers and ServerFn `orpcForActor` when middleware bound the logger.
- Web ServerFns: in-process `orpcForActor` — **preferred path for all domain writes/reads**. Browser HTTP oRPC client not used (OpenAPI via `@watchdog/client` for CLI/agents). Wide events for ServerFns come from `functionMiddleware` in `apps/web/src/start.ts` (not `withEvlog`); `orpcForActor` injects ALS `log` so procedure enrichment works on the UI path.
- **Case search:** `search.case` (`GET /cases/{caseId}/search`) → core `searchCase` → repo `ilike` helpers. Active Case nouns (entities / identifiers / evidence / tasks / jobs / pending proposals) plus Cases-by-name for switch. Web Mod+K palette calls it via `domains/search` ServerFn — not client-only `includes` filter.
- Docs: [https://orpc.dev/llms.txt](https://orpc.dev/llms.txt).
- **External SDK:** `@watchdog/client` — `createWatchdogClient({ baseUrl, apiKey })` over OpenAPI (`/api/v1`). Contract JSON is regenerated with `pnpm generate:client` after API route changes. CLI uses this; agents/MCP should too. Do not hand-roll `/api/v1` JSON paths (binary **Case Export** zip/md are authenticated file routes outside `contract.json` — `wd export` uses raw `fetch` + `x-api-key`).

## Process logging (evlog)

- Package: [`@watchdog/log`](../packages/log/AGENTS.md) — ALS (`peekRequestLogger` / `runWithRequestLogger`), `initWatchdogLogger`, `jobWideEventFields`. Pin exact `evlog`. Never depend from `cli` / `client` (stdout is the agent contract).
- **Sole HTTP emitter:** [`apps/web/src/start.ts`](../apps/web/src/start.ts) `requestMiddleware: [evlogRequestMiddleware, csrfMiddleware]` (logger outermost; `/api/**` include; exclude health, `spec.json`, Scalar). Do **not** wrap handlers with `withEvlog` (double-emit + private ALS). CSRF: `createCsrfMiddleware({ filter: serverFn })` (custom `start.ts` disables Start’s auto-install). ServerFn paths skip the `/api/**` logger; CSRF 403s on `/_serverFn` still emit warn (`auth.reason: "csrf"`).
- **ServerFns:** same file `functionMiddleware: [evlogFunctionMiddleware, requireAuth]` (logger outermost; global auth — no per-fn opt-out). One wide event per ServerFn. `orpcForActor` injects ALS `log`. Expected `UnauthorizedError` → `level: "warn"` + `auth: { denied: true, reason: "no_session" }`; unexpected throws → `log.error(err)`.
- **Errors in fields:** use `log.error(err)` or `log.setLevel` + `{ name, message }` — never `log.set({ error: someError })` (`JSON.stringify(Error)` → `{}`).
- oRPC: `createApiContext` / `orpcForActor` pass `peekRequestLogger()`; `evlog()` on `os` sets `operation`; shared middleware lifts common ids from input. `ApiContext.log?` optional outside ALS.
- Identify once in `createApiContext` (`identifyUser` + API-key fields) — one `getSession`; no dual `createAuthMiddleware` on those paths.
- Worker: `initWatchdogLogger` first in `main()`; Cap Job events from `executeJob` → `JobRunOutcome` via `jobWideEventFields` (`outcome` / `stopReason` / `abortReason` / `durationMs`). Cancel → `abort("cancel")`; Cap timeout → `abort("timeout")`. Handler failures: `log.error(err)`, not raw `Error` in `log.set`.
- Drains: `apps/web/.evlog/logs` and `apps/worker/.evlog/logs` (+ stdout) — not `apps/.evlog`. Hash-chain `.audit/` / `evlog/ai` / Sentry deferred.
- **Custody split:** `Job.logs`, `graph_writes`, Triage Accept remain SoT. evlog = process observability, not Graph audit. Never **log** secrets, Evidence bodies, or Bearer / `x-api-key` plaintext. Breach Caps may still **store** recovered credential fields inside Evidence artifacts (see [`CAPS.md`](CAPS.md) **D5**); that material belongs in the case file, not in process logs.

## Caps (boundary)

Layering: **SPI** (`@watchdog/cap-sdk` — `defineCapability`, `CapDescriptor` / `toCapDescriptor`, CapContext, types) ≠ **catalog** (`@watchdog/caps` — Cap implementations, registry, playbooks) ≠ **tools** (`@watchdog/tools` — dumb helpers with no PatchOp / Graph / Cap types). Runtime consumers (core, api, web) keep importing the catalog from `@watchdog/caps`; new Cap code imports SPI from `@watchdog/cap-sdk`. Caps re-exports the SPI for compatibility. Network helpers (`resolveDnsRecords`, `fetchRdapWhois`, `fetchWhoisXml`, `normalizeHost`, `fetchBytes`, `fetchOembed`, Wayback CDX, HTML/md + sniff) live in `@watchdog/tools` (including **producer Zod** for DNS/WHOIS/oEmbed reports). Collect Caps call them from `run` (typically via `defineCollectCap` in `packages/caps/src/lib/collect/`), `safeParse` via Cap-local `report-schema.ts` (re-exports tools schemas), and map to patches in `interpret.ts` (shared helpers: `lib/collect/interpret-observation-claim.ts`, `interpret-identifier-batches.ts`, `interpret-whois-snapshot.ts`).

- Author only via `defineCapability` / `defineCollectCap` (from `@watchdog/cap-sdk` / caps `lib/collect`) in `packages/caps` — **one folder per Cap** (`network/dns.lookup/`, `evidence/harvest/`, …; see [`packages/caps/AGENTS.md`](../packages/caps/AGENTS.md)). Zod `input.ts` lives in the Cap folder; Collect Caps add colocated `report-schema.ts` (re-export tools producer Zod) and use `lib/collect/upload-json-report-pair.ts` for dual `report.json` + named-artifact uploads; Process Caps use `evidence/lib/` (`uploadProcessArtifacts`, `draftToPatchOps`); harvest regex extractors live in `evidence/harvest/extractors/` (`HARVEST_EXTRACTORS` registry); quoted forum tails are **masked** (`quote-strip.ts`), not chopped to EOF. Fat Caps (e.g. `url.enrich`) keep Cap OPSEC UA/limits in Cap `types.ts` and pass them into tools `fetchBytes` / Wayback helpers.
- **`CapDescriptor`**: serializable projection of a Cap (no `run` / `interpret`) — identity, kind/flags/egress, consumes/produces, credentials names, jobPolicy, and Zod→JSON Schema `input` / `inputForm`. `listCapabilities()` returns descriptors for Jobs/CLI/agents. Committed artifact: `packages/caps/capabilities.gen.json` via `pnpm generate:caps` (do not hand-edit; drift-tested against live Caps). API list is live→descriptor so the picker never goes stale.
- **`run`** returns artifact metadata `{ name, mime, uri, sha256 }[]` — no Graph writes, no absolute paths / inline bytes.
- Graph proposals: optional pure **`interpret(report, opts)`** → `{ patch, summary? }` → worker creates **Proposal** (not stored on Job as the patch). Core loads canonical `report.json`; interpret has no CapContext / I/O — only Job input + Process snapshot hints.
- CapContext (for **`run` only**): `input`, `caseId`, `jobId`, `signal`, `uploadArtifact`, `readArtifact`, `scratchDir`, `getCredential`, `hasCredential`, `allowThirdPartyEgress`, `log`, optional `evidenceSnapshot` (when `jobPolicy.needsEvidenceSnapshot`). Durable bytes only via `uploadArtifact`.
- **`timeoutMs`** (optional on Cap; default `DEFAULT_CAP_TIMEOUT_MS` = 120s): Cap abort via `AbortController` in collect. Also derives pg-boss per-job `expireInSeconds`, worker graceful-stop window, and stale-`running` reclaim age (`capTimeoutMs` in `cap-sdk/src/define.ts`, `capTimeoutCeilingMs` in `caps/src/registry.ts`, `POST_RUN_SLACK_MS` in `core/src/jobs/timeouts.ts`). Do not hardcode those timings elsewhere — set `timeoutMs` on the Cap.
- **`jobPolicy`** (optional on Cap): declarative Job-runner hooks — `needsEvidenceSnapshot`, `linkEvidenceFromInput`, `markEvidenceProcessed`, `cacheTtlMs` (reuse prior Cap artifacts for identical input; ignored when `kind === "act"`). Keep Cap taxonomy out of `executeJob`.
- **`egress`**: `"none"` (default) or `"third_party"`. Cap-level `third_party` is refused in `executeJob` unless `Case.allowThirdPartyEgress`.
- **`kind` / `flags` / `consumes` / `produces`**: Cap metadata for Jobs discoverability and playbook handoffs (`collect` | `enrich` | `process` | `act`; flags like `needs_key`, `third_party`).
- Caps must not import DB write modules. No live Graph reads Day-0 — Process Caps get a packed **EvidenceSnapshot** from core before `run`.
- **`interpret` failure**: Job stays `succeeded` with artifacts/Evidence; `jobs.interpretError` set; no Proposal. UI shows an amber “interpret failed” state (not a failed Job).
- **Finding suppression**: before Proposal insert, core drops ops already on the Graph or previously Rejected (fingerprints) and stores counts on `jobs.suppressed_count` / `proposals.suppressed_count`. Cap `resultSummary` / Proposal `summary` stay Cap-owned prose — do not concatenate all-known into those strings; UI renders the no-Proposal outcome from `suppressedCount` + null `proposalId`. Cache hits set `jobs.from_cache`. Collect run detail and Triage surface chips + Reject FP copy.
- **Identifier collision warn**: listing Proposals, core compares patch Identifier ops to `listForCase` (index by `type+value`). Same value on a _different_ Entity annotates `ProposalRecord.identifierCollisions`. Triage Alert + per-op chip; Accept still allowed. Not finding suppression (that drops ops). Caps stay Case-blind.
- **Identifier write gate**: `@watchdog/schemas` `validateIdentifierWrite` (normalize + soft-strict value + handle→platform). Core create / update / Accept throw `DomainError("invalid")`. Triage `listInvalidIdentifierOps` preflight **blocks** Accept (unlike collisions). Caps stay imprecise; Graph writes do not.
- **Agent/CLI ingress** (`packages/core` `agent-ingress` + `@watchdog/cli`):
  - Default: `POST …/proposals` / `wd proposals create` → pending Proposal (`agentSourced` + `createdBy`); shares Cap `proposeStage` + finding suppression.
  - Escape hatch: `POST …/graph/write` / `wd graph write` with body `userOverride: true` (CLI verb _is_ the hatch — no boolean flag) → Graph @ `unverified` + `graph_writes` row in the **same tx** as `applyPatch` (summary→attestation inside that tx). Optional `idempotencyKey` (replay returns `replayed: true`, `opCount: 0`). No Proposal.
  - Dossier-style child writes: `wd claims|identifiers|edges|events|questions …` require **`--user-override`**; CLI **refuses `confidence=confirmed`** (Triage Accept / Dossier may set `confirmed`). Prefer proposals when unsure.
  - Pure prep: `parseAgentPatch` + `assertPatchShape` (policy). Cap Jobs still set `agentSourced=false`.
  - CLI output contract: compact JSON by default (`{ count, items, help? }`); `--table` / `--full` / `--raw`; see [`packages/cli/AGENTS.md`](../packages/cli/AGENTS.md).
- LLM helpers live in **`@watchdog/ai`** (provider + `structuredExtract` + draft Zod). Caps call helpers; `draftToPatchOps` stays in `@watchdog/caps`.
- **Prompts are Cap-local for now** — system/user strings live next to the Cap (or thin helpers in `@watchdog/ai`). No shared `ops.prompts` store / Settings prompt UI until a second Cap earns it.
- **Job-internal artifacts** (`isJobInternalArtifact` + artifact/Cap id constants in `@watchdog/schemas` `job-artifacts`) never become Case Evidence rows — e.g. `report.json`, `evidence-snapshot.json`, `derived.json`, enrich `live.*` / `enriched.md` / `links.json` / `enrich-summary.json`. Still on the Job `output` for Detail / Process packing. Process Caps upload snapshot + `report.json` + `derived.json` (no duplicate aliases).

## Cap credentials

Settings stores Cap secrets encrypted (AES-256-GCM) under `WD_MASTER_VAULT_KEY` (required non-empty via `@watchdog/env/server`; format/normalize in `vault.ts`). Same vault is exposed to agents via oRPC `GET|PUT|DELETE /credentials` and `wd credentials` (never returns plaintext; put via `--stdin` / `--secret-env`). Core helpers: `listCredentialSlots` / `putCredentialSlot`. Caps load via `ctx.getCredential(name)` — **never** `process.env` / Cap secrets in env, never in `Job.input` / Export. Known names: `packages/caps` `KNOWN_CREDENTIALS`. Deploy/boot vars use `env.*` from `@watchdog/env/server`; CLI API auth uses `loadCliEnv()` (`WD_API_*` only — lazy so `wd --help` works without a key).

`CapabilityDef.credentials` is a list of specs, fail-closed at `startJob` / playbook start and again in worker preflight before `run`:

| Spec | Meaning |
| --- | --- |
| `{ name }` | Required — Job fails closed if missing |
| `{ name, optional: true }` | Present-or-skip |
| `{ anyOf: [a, b, …] }` | At least one name must be set (e.g. AI Process providers) |

Process AI resolves `ANTHROPIC_API_KEY` or `AI_COMPAT_API_KEY` (+ optional `AI_COMPAT_BASE_URL`) at run time via those credentials.

## Intake

Partner TLDR: **Dump → Enrich (URL) → Process → Triage Accept** (human sets confidence).

- **Detail tabs** on a queue row: **Content** (source dump) · **Output** (latest Enrich `enriched.md` when present) · **Jobs** (related Cap runs via `ProcessRunCard`).
- Dump association: toolbar + File/Paste/URL modals share one Case Entity target (`EntityCombobox`; Unattached allowed). Dossier Evidence tab is a second dump entry with Entity locked (same presign / confirm / paste / URL APIs; Intake still owns dump). Evidence Detail can attach / replace / detach after dump (`PATCH evidence.entityId`).
- **Process** (verb on Intake) → Cap Job `evidence.harvest` (deterministic) or `evidence.extract.ai` (LLM). Core packs **EvidenceSnapshot** (falls back to Enrich Job `enriched.md` for URL-only dumps) → Cap fills **ProcessExtractDraft** → `interpret` → **Proposal** when an Entity is attached. Sets `processedAt` when interpret says so (Proposal, or empty extract with text present) — **not** when signal needs an Entity, or URL dump still has empty text (Enrich first). Filter Unprocessed / Unattached. Same glue via OpenAPI `evidence.process` and `wd evidence process` (`--ai` for extract).
- **Enrich** (URL dumps) → Cap Job `network.url.enrich` (live + Wayback). **Run-only** — no `interpret` / Proposal (Process owns extract). Cap is **URL-centric** (`network.*`); Intake glue `enrichUrlEvidence` reads `sourceUrl` and starts the Job (OpenAPI `evidence.enrich` / `wd evidence enrich`). Cap folder layout: `network/url.enrich/{cap.ts, input.ts, fetch-bytes.ts, ingest-page.ts, wayback.ts, types.ts}` — `ingest-page` uses `@watchdog/tools` HTML helpers. Markdown pipeline: prefer `Accept: text/markdown` from origin, else local HTML→md — **do not** proxy investigation URLs through `markdown.new` by default (OPSEC). All enrich artifacts stay on the **Job** (Output tab — not new queue rows). `enriched.md` = page prose **plus** `## Outbound links` (absolute hrefs; `links.json` sidecar).
- Lexicon: **Collect** = dump + Cap/Job runs (`/collect`); **Process Cap** / **Enrich Cap** = Cap ids above; **Triage** = Accept gate (`/triage`). **`intake`** / **`jobs`** domains = shared Evidence/Job RPC (no standalone queue routes). Do not compound “Intake Process” as a type.
- **File dump:** client SHA-256 → `presignUploadFn` → PUT MinIO (presigned) → `confirmFileUploadFn` (HeadObject verify → Evidence). Same loop via OpenAPI (`evidence.presign` / `confirmFile`) and `wd evidence file`. Paste hashes server-side via `uploadArtifact`. Max 100 MB/file (`MAX_UPLOAD_BYTES` in `@watchdog/schemas`). URL dump = metadata only until Enrich.

## Case Export

Worker / API write a live markdown shadow under `export/<case-slug>/` (default; override with `WD_EXPORT_DIR`). Directory is **gitignored** — regenerable projection, not vault SoT. A Case name rename regenerates the slug and best-effort `rename`s that dir, then `scheduleCaseExport`. UI offers Case Export zip; agents use authenticated file routes `GET …/cases/{id}/export.zip` and `…/entities/{slug}/export.md` (API key OK) via `wd export zip|md`. Details: `@watchdog/core` `infra/export-sync`.

## Controlled vocab

Platform enums, identifier platform catalog (`IDENTIFIER_PLATFORMS` + normalize/resolve helpers), identifier normalize/validate (`validateIdentifierWrite`), `PatchOp` / `patchOpSchema`, `EvidenceSnapshot`, fingerprints, and Cap/Job artifact id constants live in `@watchdog/schemas` (peer Zod; no Drizzle). Freeform platform strings remain allowed; catalog is suggestions + alias normalization. UI and domain code import consts/types from there **directly** — do not re-export through `domains/*/types.ts` or `*.functions.ts`. `@watchdog/db` may re-export the `PatchOp` type for column typing; parse via `@watchdog/core` (`parsePatch` / `tryParsePatch`). Custody gates live in `@watchdog/policy`. Details: [`TYPES.md`](TYPES.md).

## See also

| Doc | Owns |
| --- | --- |
| [`CAPS.md`](CAPS.md) | Cap id/title/kind lexicon, method vocabulary, D1–D5, ship gates |
| [`PRODUCT.md`](PRODUCT.md) | Intent / doctrine |
| [`TYPES.md`](TYPES.md) | Schemas / Zod ownership |
| [`UX.md`](UX.md) | Investigator flows / Accept rules |
| [`apps/web/docs/ARCHITECTURE.md`](../apps/web/docs/ARCHITECTURE.md) | Start / Vite / web server boundary |
| Package AGENTS | Path-scoped Don’t+Do |
