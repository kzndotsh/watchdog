# Caps package (`@watchdog/caps`)

> Scope: `packages/caps` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Cap implementations, the registry, Playbooks, and the Cap SPI (`@watchdog/caps/sdk`, `src/sdk/`). Caps never write the Graph: `interpret` returns Proposal ops only, and **Triage Accept** (or Dossier) applies them. New Cap: load `/create-cap`. Naming, layers, and ship gates D1–D5: [`caps-lexicon`](../../docs/reference/platform/caps-lexicon.md).

## Commands

| Task                    | Command                                  |
| ----------------------- | ---------------------------------------- |
| Typecheck (src + tests) | `pnpm --filter @watchdog/caps typecheck` |
| Regen catalog           | `pnpm generate:caps`                     |
| Cap unit tests          | `pnpm test:unit`                         |

## Rules

| Rule | Enforced by |
| --- | --- |
| `run` returns an Effect (`CapRun`: `Effect<CapRunResult, ToolsTag, CapServices>`; `ToolsTag` is the only vendor error family, and `runCap` rethrows the tag itself); `interpret(report, opts)` is pure/sync and returns Proposal ops. Cap I/O on `CapContext` (`uploadArtifact`, `getCredential`, `readArtifact`, …) is Effect | types (`src/sdk/define.ts`) |
| A `ValidationVendorError` raised in a Cap carries a fixed message; its `cause` is logged server-side, so it holds upstream diagnostics only (status, error class), never the caller's input (URL, email, IOC) or free upstream or model text that can echo it (use `upstreamDiagnostic`); the message reaches clients and Job failure text. Covered for `extract.ai`, `media.oembed` and `wayback.fetch`; the other Caps are guidance | `run.test.ts` / `fetch-error.test.ts` |
| Secrets via `ctx.getCredential`; never in `Job.input` or logs. Caps have no `@watchdog/db` dependency | `package.json` + knip for the dependency; the rest is guidance |
| A Cap's worker lane derives from its descriptor (`capLane`: `act` kind is `act`, `process` kind or `slow` flag is `heavy`, else `quick`); set `lane` only to override. An `act` Cap runs at most once per Job (it starts from `queued` only; a lost attempt is failed by reconcile, never re-run), so it need not be idempotent | `src/sdk/__tests__/lane.test.ts`; core `act-once.int.test.ts` |
| A Cap that reads user-supplied bytes passes a limit to `ctx.readArtifact(uri, { maxBytes, reason })` (the refusal is a `ValidationVendorError` with the fixed `reason`, and the object is never loaded in full); `eml.analyze` and `file.analyze` do. No other Cap reads an artifact | `blob-store.test.ts` (core), the two `run.test.ts` |
| Set `timeoutMs` on the Cap; it drives abort/expire/stale reclaim, so do not hardcode those timeouts in worker/core | guidance |
| A Cap has no authored version: `version` in `capabilities.gen.json` is a SHA-256 fingerprint (12 hex) of the modules the Cap's `cap.ts` reaches, written by `pnpm generate:caps` (`src/cap-fingerprint.ts`). The crawl follows imports to the module that defines each symbol (a barrel is looked through, so one vendor edit moves only its own Caps), counts `@watchdog/schemas` and the lockfile version of each npm package a reached module imports, and skips generated files, `__tests__`, type-only imports and the shared transport files of `packages/tools/src/http` (`safe-fetch`, `capped-body`, `outbound-*`, `http-client-layer`, `redirect`, `blocked-address`, `abort-when`, `transport-error`); the logic files there (`fetch-json`, `http-probe*`, `unshorten`, `page-enrich`, `oembed`, ...) count. The version keys the result cache; core reads it through `capVersion` (`@watchdog/caps`) | `src/__tests__/capabilities-gen.test.ts` recomputes it, so `pnpm test` fails on a stale catalog; `src/__tests__/cap-fingerprint.test.ts` |
| Never hand-edit `capabilities.gen.json` or `docs/reference/platform/cap-register.md`; run `pnpm generate:caps` | CI drift job (`ci.yml`), `src/__tests__/cap-register.test.ts` |
| Every Cap has a `provider` (shared constants in `src/providers/`), read from the provider's own terms; `commercialUse: "unknown"` when they are unclear or unreachable, never a guess; `attribution` only where the terms require credit | type (`CapabilityDef.provider`); the verdicts are reviewed by hand |
| State a fact once: `flags` holds `slow` / `invasive` only (`needs_key` derives from `credentials`, `third_party` from `egress`), `reportLabel` defaults to the id, and the user agent is the `{ userAgent }` that `defineCollectCap` hands to `fetch` | type; `watchdog/no-derived-cap-metadata` |
| A Cap under `breach/` is a breach Cap (`isBreachCap`, derived flag `breach`; never authored): off until `WD_ENABLE_BREACH_CAPS=1`, enforced in core at availability, start-job, preflight and Playbook start ([`caps-lexicon`](../../docs/reference/platform/caps-lexicon.md#breach-caps-are-opt-in)); `checkCapabilityAvailability` / `checkPlaybookAvailability` take `breachCapsEnabled`, so a new caller must pass it | type (`AvailabilityOpts`); `src/__tests__/breach-category.test.ts`; core `breach-opt-in.int.test.ts` |
| Playbook ids are kebab-case and the first token equals `seedKinds[0]`; Cap ids keep dots | `src/playbooks/__tests__/naming.test.ts` (ids), nothing for Cap ids |
| Inside `playbooks/`, import Caps from `../registry`, not the `@watchdog/caps` barrel | guidance |
| Every Collect Cap has `__tests__/interpret.test.ts`; mock HTTP with `@watchdog/test-kit/http`, never `msw` | guidance |
| Tools (`@watchdog/tools`) own producer Zod and fetch/parse; Caps import those schemas from `@watchdog/tools/<domain>` subpaths (never re-export them), own artifact upload and `interpret` | guidance |

## Gotchas

- `core` imports SPI types and `runCap` from `@watchdog/caps/sdk` and the catalog from `@watchdog/caps`. Inside this package import the SDK by relative path (`../../sdk`): Vite does not resolve package self-references.
- `runCap` is the Promise edge for `run()` tests (it provides `toolsHttpClientLayer`; a sanctioned edge in `effectRunEdges`, `oxlint.config.ts`). Job collect yields `cap.run(ctx)` directly. `itRunsCollectCap` (`src/testing`) covers the thin Collect Caps; harvest, extract.ai, url.enrich, file.analyze, and eml.analyze have dedicated `run.test.ts`.
- Layout: one folder per Cap id, dots → path segments (`network/dns.lookup/{cap,interpret,input}.ts`); shared helpers in `evidence/lib/` (Process) and `lib/collect/` (Collect, `defineCollectCap`). Collect `input.ts` seeds use the `@watchdog/schemas` `*SeedSchema` helpers, not bare `requiredText`; seeds normalize at parse time, and `toCapDescriptor(def, version)` (the catalog) and `toCapMetadata(def)` (no version, for callers that read a Cap's declared metadata) must emit JSON Schema from the input shape so `pnpm generate:caps` stays green.
- Collect interpret emits `validatedIdentifierValue`-normalized identifiers so Collect and Process dedupe the same way (IPv6 canonicalized, related values equal to the query seed dropped). Process interpret throws on malformed ctx ids; Collect returns `INVALID_COLLECT_ENTITY_SUMMARY`.
- Playbooks: `planPlaybook` validates the whole recipe and emits step 0 only; a later step is created once the step before it has settled and the steps it reads succeeded. Bind fills the next Job from the seed, `evidenceIds`, or Cap `handoff` bags (pure `handoff?: (report) => JobHandoff | undefined`, persisted by core on success including cache hits). Fan-out inserts capped sibling Jobs (`playbookFanIndex`); an empty fan-out completes its step and the run goes on. `decidePlaybookAdvance` never abandons: a step whose bind or fan-out sources (`playbookStepDependencies`, transitive) ended without success is skipped, a bind or fan-out error counts as that step failing, and the run finishes with an `outcome` (`succeeded | partial | failed`) when no step can run; `playbookStepViews` is the pure per-step view (skipped is derived, never stored). Do not fold harvest + extract.ai or act Caps into default books.
- Breach corpus (D5): paid dump Caps may put recovered credentials in Evidence and Claim samples; do not strip them "for safety", and never `ctx.log` them. HIBP / Hudson Rock stay counts-only because their APIs return no plaintext.
- DNS/WHOIS Collect Caps call `normalizeHost` before resolving.
- `CapContext.caseId` is a `CaseId` (ADR-0003) and `evidenceSnapshot.caseId` is branded through `evidenceSnapshotSchema`; test harnesses build them with `testCaseId` from `@watchdog/schemas/testing`, never a cast.
- `tsconfig.json` extends the root `tsconfig.base.json` (Node types, no JSX) and excludes tests like every package; `tsconfig.test.json` adds them. It no longer extends `apps/web/tsconfig.json` (enforced by `scripts/__tests__/tsconfig-base.gate.test.ts`).
- Vault slots (`known-credentials.ts`) are secrets unless the entry says `secret: false` (a base URL such as `AI_COMPAT_BASE_URL`): core registers each secret value a Cap reads with the Job's provider-call ledger, so recorded URLs show it as `[credential:NAME]` (`isSecretCredential`; see [`caps-boundary`](../../docs/reference/platform/caps-boundary.md#outbound-http)). A new config-only slot sets `secret: false`.

See also: [`packages/core/AGENTS.md`](../core/AGENTS.md) · [`packages/tools/AGENTS.md`](../tools/AGENTS.md) · [`docs/reference/platform/README.md`](../../docs/reference/platform/README.md).
