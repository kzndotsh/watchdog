# Caps package (`@watchdog/caps`)

> Scope: `packages/caps` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

Cap implementations, registry, and Playbooks. Caps never write the Graph — `interpret` → Proposal only.

## Commands

| Task | Command |
| --- | --- |
| Typecheck | `pnpm --filter @watchdog/caps typecheck` (workspace TypeScript **7.0.2**; keep the exact pin in `package.json`, do not float `^6`) |
| Regen catalog | `pnpm generate:caps` |
| Cap unit tests | `pnpm test:unit` |

## Boundaries

| Do | Don’t |
| --- | --- |
| `run` returns Effect `CapRun` (tests use `runCap`); secrets via `ctx.getCredential` (Effect) | Import `@watchdog/db` or apps; put secrets in `Job.input`; a Promise-typed `run` on `CapabilityDef` |
| Pure `interpret(report, opts)` → Proposal ops | Hand-edit `capabilities.gen.json` |
| Set `timeoutMs` on the Cap (drives abort / expire / stale reclaim) | Hardcode those timeouts in worker/core |
| Import Caps from `../registry` inside `playbooks/` | Import via `@watchdog/caps` barrel from playbooks |

## Gotchas

- Layout: one folder per Cap id (dots → path segments). Minimal Collect: `network/dns.lookup/{cap.ts, interpret.ts, input.ts, report-schema.ts}`. Fat Caps add sibling modules (e.g. `url.enrich/{fetch-bytes, ingest-page, wayback, types}.ts`). Shared: Process → `evidence/lib/`; Collect → `lib/collect/` (`define-collect-cap.ts` — `run` is `Effect.gen`; `fetch` returns Effect (`ToolsTag`); `uploadJsonReportPair` is Effect; `upload-json-report-pair.ts`, `interpret-observation-claim.ts`, `interpret-identifier-batches.ts` — skip invalid Identifier values via `validateIdentifierValue`; `interpret-whois-snapshot.ts` — `interpretTypedIdentifiers` is a thin re-export); harvest regex → `evidence/harvest/extractors/` + `HARVEST_EXTRACTORS`. Quoted forum tails: mask spans (`quote-strip.ts`), don’t chop to EOF. Do not emit harvest Questions that tell the investigator to run another Cap (e.g. oEmbed). `evidence.file.analyze` / `evidence.eml.analyze` `run()` fail when there is no `uri` and empty snapshot text (Job fails at Collect, not interpret throw). Harvest / file.analyze / eml.analyze / extract.ai / url.enrich `run` is `Effect.gen`. Prefer vendor `*Effect` helpers (e.g. `fetchShodanHostEffect`) when the Cap `fetch` is already an Effect.
- **Naming / ship gates:** [`docs/reference/platform/caps-lexicon.md`](../../docs/reference/platform/caps-lexicon.md) — id/title/kind layers, method vocabulary, D1–D5 (incl. breach credential bodies), passive=`useCases` Passive/Footprint vs active=`invasive`+Active, one HTTP-surface Cap, public-vs-paid split.
- Playbook ids are kebab-case; first token === `seedKinds[0]`; Cap ids keep dots. Seeds: host/url/evidence/ip/email/hash/handle. Bind fills the next Job from seed, `evidenceIds`, or Cap `handoff` bags when the step is created (not Proposals). Fan-out inserts capped sibling Jobs (`playbookFanIndex`); empty fan-out skips (finish), not abandon. Join before the next recipe step. Shipped: `host-footprint`, `host-posture`, plus reputation/history/ip/email/hash/handle books, bind (`host-contacts`, `url-resolve`, `evidence-file`), `host-enumerate` (CT→DNS max 25). Do not fold harvest+extract.ai or act Caps into default books. `planPlaybook` validates the whole recipe and emits step 0 only; later steps are created after the previous Job succeeds. New playbook Jobs are always `queued` — `blocked` remains in job vocab for historical rows only. `decidePlaybookAdvance` still treats all-`blocked` steps as releasable (`blockedOnly` shim in `advance.ts`); remove that branch once no in-flight runs carry pre-inserted `blocked` rows.
- Authoring checklist: fill interpret target · named source · credential · passive/active · egress before registering a Cap; then `pnpm generate:caps`.
- **Breach corpus (D5):** paid dump Caps may put recovered passwords/hashes in Evidence + Claim samples. Do not strip credential fields “for safety.” Still never `ctx.log` those bodies. Metadata-only vendors (HIBP / Hudson Rock) stay counts-only because their APIs do not return plaintext.
- Tools (`@watchdog/tools`) return dumb fetch/parse results and own **producer Zod** (`dnsRecordsSchema`, `whoisSnapshotSchema`, `oembedSnapshotSchema`) — no PatchOp / Graph / Cap SPI. Caps re-export those schemas from Cap-local `report-schema.ts` only (not from `interpret.ts`), own artifact upload, and `interpret`. HTTP/Wayback helpers (`fetchBytesEffect`, `closestWaybackTimestampEffect`, `fetchOembedEffect`) take UA/limits as params; Cap OPSEC constants stay in Cap `types.ts`. `url.enrich` ingest/CDX wrappers are Effect-first.
- DNS/WHOIS Collect Caps call `normalizeHost` before resolve/lookup. DNS interpret: A/AAAA as `ip`; NS/MX in the Claim only. WHOIS interpret: `interpretWhoisSnapshot` (Claim + optional expiry Event). Typed snapshots: annotate `WhoisSnapshot` / `DnsRecords` in Cap `run` (tools inferred types).
- **Tests:** every Collect Cap keeps `__tests__/interpret.test.ts`. Do not add 58 `run()` suites — `itRunsCollectCap` from `@watchdog/test-kit/it` covers three Caps; harvest / extract.ai / url.enrich / file.analyze / eml.analyze have dedicated `run.test.ts`. HTTP mocks: `@watchdog/test-kit/http`, never `msw`.

## See also / External References

| Need | File |
| --- | --- |
| Cap naming / lexicon | [`docs/reference/platform/caps-lexicon.md`](../../docs/reference/platform/caps-lexicon.md) |
| Cap SPI | [`packages/cap-sdk/AGENTS.md`](../cap-sdk/AGENTS.md) |
| Job runner | [`packages/core/AGENTS.md`](../core/AGENTS.md) |
| Dumb helpers | [`packages/tools/AGENTS.md`](../tools/AGENTS.md) |
| Platform architecture | [`docs/reference/platform/README.md`](../../docs/reference/platform/README.md) |
