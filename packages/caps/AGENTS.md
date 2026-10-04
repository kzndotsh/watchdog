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
| Secrets via `ctx.getCredential`; never in `Job.input` or logs. Caps have no `@watchdog/db` dependency | `package.json` + knip for the dependency; the rest is guidance |
| Set `timeoutMs` on the Cap; it drives abort/expire/stale reclaim, so do not hardcode those timeouts in worker/core | guidance |
| Never hand-edit `capabilities.gen.json`; run `pnpm generate:caps` | CI drift job (`ci.yml`) |
| Playbook ids are kebab-case and the first token equals `seedKinds[0]`; Cap ids keep dots | `src/playbooks/__tests__/naming.test.ts` (ids), nothing for Cap ids |
| Inside `playbooks/`, import Caps from `../registry`, not the `@watchdog/caps` barrel | guidance |
| Every Collect Cap has `__tests__/interpret.test.ts`; mock HTTP with `@watchdog/test-kit/http`, never `msw` | guidance |
| Tools (`@watchdog/tools`) own producer Zod and fetch/parse; Caps import those schemas from `@watchdog/tools/<domain>` subpaths (never re-export them), own artifact upload and `interpret` | guidance |

## Gotchas

- `core` imports SPI types and `runCap` from `@watchdog/caps/sdk` and the catalog from `@watchdog/caps`. Inside this package import the SDK by relative path (`../../sdk`): Vite does not resolve package self-references.
- `runCap` is the Promise edge for `run()` tests (it provides `toolsHttpClientLayer`; allowlisted in `check-effect-edges`). Job collect yields `cap.run(ctx)` directly. `itRunsCollectCap` (`src/testing`) covers the thin Collect Caps; harvest, extract.ai, url.enrich, file.analyze, and eml.analyze have dedicated `run.test.ts`.
- Layout: one folder per Cap id, dots → path segments (`network/dns.lookup/{cap,interpret,input}.ts`); shared helpers in `evidence/lib/` (Process) and `lib/collect/` (Collect, `defineCollectCap`). Collect `input.ts` seeds use the `@watchdog/schemas` `*SeedSchema` helpers, not bare `nonEmptyTrimmed`; seeds normalize at parse time, and `toCapDescriptor` must emit JSON Schema from the input shape so `pnpm generate:caps` stays green.
- Collect interpret emits `validatedIdentifierValue`-normalized identifiers so Collect and Process dedupe the same way (IPv6 canonicalized, related values equal to the query seed dropped). Process interpret throws on malformed ctx ids; Collect returns `INVALID_COLLECT_ENTITY_SUMMARY`.
- Playbooks: `planPlaybook` validates the whole recipe and emits step 0 only; later steps are created after the previous Job succeeds. Bind fills the next Job from the seed, `evidenceIds`, or Cap `handoff` bags (pure `handoff?: (report) => JobHandoff | undefined`, persisted by core on success including cache hits). Fan-out inserts capped sibling Jobs (`playbookFanIndex`); an empty fan-out finishes rather than abandons. Do not fold harvest + extract.ai or act Caps into default books. Legacy `blocked` rows: see [`jobs.md`](../../.agents/skills/effect/references/jobs.md).
- Breach corpus (D5): paid dump Caps may put recovered credentials in Evidence and Claim samples; do not strip them "for safety", and never `ctx.log` them. HIBP / Hudson Rock stay counts-only because their APIs return no plaintext.
- DNS/WHOIS Collect Caps call `normalizeHost` before resolving.
- `tsconfig.json` extends the root `tsconfig.base.json` (Node types, no JSX) and excludes tests like every package; `tsconfig.test.json` adds them. It no longer extends `apps/web/tsconfig.json` (enforced by `scripts/__tests__/tsconfig-base.gate.test.ts`).

See also: [`packages/core/AGENTS.md`](../core/AGENTS.md) · [`packages/tools/AGENTS.md`](../tools/AGENTS.md) · [`docs/reference/platform/README.md`](../../docs/reference/platform/README.md).
