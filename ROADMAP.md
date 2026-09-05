---
document_created: 2026-07-27T23:08
document_updated: 2026-09-05T13:40
---

# Watchdog ROADMAP

Living phase / backlog SoT for **product work**. Nouns, Cap loop rules, intent, personas and doctrine: [`docs/explanation/product.md`](docs/explanation/product.md). UI contracts: [`docs/reference/web/`](docs/reference/web/README.md). Platform UX: [`docs/explanation/ux.md`](docs/explanation/ux.md). The `_legacy-*` trees are untracked, frozen mines — **do not extend**.

---

## How to read this

| Section               | Use for                                |
| --------------------- | -------------------------------------- |
| Maturity              | Honest “what works today”              |
| Earned / out of scope | Don’t reopen settled bets              |
| Legacy mines          | What to steal vs never resurrect       |
| Phases 0–3            | Ordered goals (earn complexity)        |
| Working backlog       | Actionable checkboxes (Phase 0–1 only) |

Update this file when a phase item ships or a deferred item is earned. Don’t invent a second `TODO.md`.

---

## North star

Small-team (often 1–2) OSINT: keep one **Case Graph** of Claims + Evidence you can defend, while collection stays fast. Loop: **Collect → Decide (Triage) → Graph under human custody → Export Case package**. Caps and agents never write Graph unchecked (Proposal → Accept, or human Dossier write). Postgres is SoT; markdown Export is a projection.

### Field research

Signal-era field work + build principles confirm this north star and Phases 0–1. They do **not** add backlog items. Personas, pain, anti-patterns, rewrite lessons, and design doctrine live in [`docs/explanation/product.md`](docs/explanation/product.md) — past practice ≠ design.

---

## Current maturity

| Surface | Score | Notes |
| --- | --- | --- |
| Auth / session | **done** | Better Auth org tenancy (install org + Team invite), instance-admin Users, protected shell, API keys |
| Cases (UI) | **done** | Create / switch / Export zip |
| Cases (API/CLI) | **done** | List / get / create / update (`wd cases update`; egress flag) |
| Entities + Dossier | **done** | Full section CRUD; Overview BLOT still heavy |
| Collect dump + Process | **done** | Paste / file / URL on `/collect`; deterministic harvest Cap → Proposal; optional Extract (AI) |
| Jobs + worker | **done** | Cap → Job-internal artifacts + Proposal; Enrich does not flood Evidence |
| Triage Accept | **done** | Confidence + evidence gates |
| Caps catalog | **strong** | **63** Caps (`pnpm generate:caps`); Collect via `defineCollectCap`; Jobs CapMatch / empty-default picker; deepen quality later |
| Cap SPI / tools / policy | **done** | `@watchdog/{cap-sdk,tools,policy}`; pure interpret + fixture tests |
| `@watchdog/ai` | **done** | Provider + structuredExtract + draft Zod |
| Cap credentials | **done** | AES vault + Settings + OpenAPI / `wd credentials` (no plaintext out) |
| Finding suppression | **done** | Core fingerprints + structured `from_cache` / `suppressed_count` chips in Collect/Triage |
| Playbooks | **mid** | Linear `PLAYBOOKS` + API/CLI `runPlaybook` + Jobs Cap/Playbook form; depth/opts later |
| Export md / zip / shadow | **done** | UI + file routes + `wd export zip | md` + worker sync |
| OpenAPI / CLI | **strong** | Typed `@watchdog/client` + agent-first `wd` (compact JSON; graph-child; credentials; evidence hide/restore/download/process/enrich; `apiKeyAuth`). Web-only leftovers: Active Case cookie. `@watchdog/contract` deferred (Phase 2) |
| Agent Proposal create / graph write | **done** | Propose → Triage; `graph write` → Graph @ unverified + `graph_writes` (atomic tx, idempotency); child writes need `--user-override` |
| MCP | **missing** | Phase 2+ |
| Web automated tests | **pyramid** | Packages+worker unit; web lib+component in jsdom; Postgres integration; tagged Playwright suite (`e2e/specs/`, 18 tests) |
| Scrape / vault import / corpus / LE packs | **missing** | Earned later |

**Overall:** ~8/10 small-team investigator UI loop (org-scoped cases + Team invite) · ~6/10 agent-first ingress.

---

## What we already earned (don’t reopen)

- Day-0 screens + Queue / Detail / Split chrome lexicon
- Graph nouns + `@watchdog/schemas` + Triage Accept rules
- DNS / WHOIS Caps + pg-boss worker + Cap credentials
- Evidence dump (paste/file) + soft-delete Hide
- Case Export package (md + zip + shadow workspace)
- Foundation polish: TanStack Query SoT, domains layout, DS cutover, auth session/layout
- Evidence + Proposal (not Scratch / Candidate / promote)
- `@watchdog/ai` + Process Cap path (EvidenceSnapshot → ProcessExtractDraft → Proposal → Triage)
- Cap package split (`cap-sdk` / `tools` / `policy`) + pure `interpret(report, opts)` + `report.json`
- Cap result cache + known-finding suppression (Reject fingerprints)
- Linear playbooks (API/CLI + Jobs Cap/Playbook run form)
- Agent-first CLI parity (credentials, export, graph-child `--user-override`, evidence hide/restore/download/process/enrich, compact JSON)

---

## Legacy mines

| Mine | Steal (ideas / algorithms) | Never resurrect |
| --- | --- | --- |
| `_legacy-v1/` | Harvest regex + config, classify/adjudicate prompts, confidence ceilings, forum scrape patterns, checkpoint/DLQ ops | Vault-as-DB, ARQ/Python platform core, Scratch dual-control, hardcoded sockhunt targets, “Promote” as Cap verb |
| `_legacy-v2/` | LIVE network Cap algorithms, write-gate _spirit_, Graph Studio UX patterns, Playbook seeds (when earned), external-tools hub ideas | Scratch / Candidate / Door A/B, Mutation R-tiers as Day-0, docs-v2 as coding SoT, visual iPaaS, Cap catalog theater without depth |

Port by **reimplementing in TS Caps** when pain is real — don’t copy the Python trees wholesale.

---

## Phase 0 — Stabilize Day-0 promises ← NOW

Close the gap between what Day-0 _promises_ and what ships.

1. ~~Deepen Evidence Process Caps~~ **done** — `evidence.harvest` + `evidence.extract.ai` via `@watchdog/ai`
2. ~~Agent Proposal **create** + graph write end-to-end (API + CLI)~~ **done**
3. ~~OpenAPI parity: Case create/update, evidence file / presign~~ **done** — `POST /cases` + `PATCH /cases/{id}` + `wd cases create|update` (incl. egress); evidence `presign` + `confirmFile` + `wd evidence file`
4. ~~Doc drift (Export / Commands / `WD_EXPORT_DIR`)~~ **done** — `export/` gitignored; env + AGENTS + web docs aligned
5. ~~URL dump → real archive Cap~~ **done** — `network.url.enrich` (live + Wayback + md + outbound links); deepen quality later

---

## Phase 1 — Cap depth + agent ingress

Make Collect + agent paths feel real.

- Port LIVE network / archive Cap ideas into TS (CT, subdomain, TLS / mail / headers, Wayback) — **largely done** (63 Caps); deepen quality / IntelX / CIRCL PDNS later
- ~~Capability picker / discoverability polish on Jobs~~ **done** (CapMatch + filters + empty-default select)
- ~~Cmd+K / global hotkeys~~ **done** (Mod+K Active Case search + Jump to; Mod+B sidebar; `?` Shortcuts)
- ~~Identifier value validation~~ **done** (schemas `validateIdentifierWrite`; core create/update/Accept; Triage blocks)
- ~~Suppression / cache explainability in Collect + Triage UI~~ **done**
- ~~Paste-to-run / CapMatch-style launcher on Jobs~~ **done**
- ~~Finish residual OpenAPI / CLI ↔ ServerFn parity (Collect Process+Enrich)~~ **done** — `POST …/evidence/{id}/process` + `/enrich`; `wd evidence process|enrich`. Web leftover: Active Case cookie

---

## Phase 2 — Scale when it hurts

Only when Case load or workflow demands it.

- ~~Playbooks UI (linear + batch)~~ **done** — Jobs Cap/Playbook form; no visual DAG
- Scrape checkpoint UX
- Vault `graph/` → Case import
- Graph Studio (Cap context + full `/graph` canvas; dossier 1-hop neighborhood shipped)
- MCP over the same OpenAPI / Caps
- Dual-control Accept for identity merges
- `network.*.monitor` (baseline snapshot vs next Job → CHANGE/NEW/GONE) — needs scheduled Jobs
- Cross-entity correlation Cap (`shares_ip_with` / shared NS/MX) — Caps cannot read the Case; Triage identifier-collision warn is the shipped 80%
- External tools hub (link-out, not Caps)
- **`@watchdog/contract` (contract-first oRPC)** — earn when agents/MCP must not depend on `@watchdog/api` even for types, or API surface is designed ahead of handlers. Until then: router SoT + `minifyContractRouter` → `@watchdog/client`

### Also track (ops / parity debt)

- ~~OpenAPI/CLI: credentials vault; export zip/md; evidence soft-delete/restore/download; graph-child CLI verbs; `cases.update` + egress~~ **done** (binary export stays file routes + `wd export`; OpenAPI declares `x-api-key`)
- ~~ServerFn → oRPC for Collect Process+Enrich~~ **done**
- ~~Retire deprecated `analysis.json` alias~~ **done**; ~~`PROCESS_CAPABILITY_ID` aliases~~ **done**
- Postgres + MinIO backup/restore story
- Error monitoring (Sentry or equivalent) — deferred
- Process logging (`@watchdog/log` / evlog NDJSON under `apps/*/.evlog/logs/`) — **shipped**
- Ops `.audit/` hash-chain / `evlog/ai` — deferred
- ~~`knip` unused-export gate in CI~~ **done**
- ~~Credential pre-check on Collect run form; Triage `?proposalId=` URL sync; Triage pending-first; Evidence Detail Entity attach~~ **done**

---

## Phase 3 — Dream / only with ADR

- Corpus browse + quarantine (illegal content = pointer, not bytes)
- LE referral / MISP / TheHive report packs (after Export is trusted)
- Ambient Copilot (propose-only)
- Sock / ACH / red-team Caps as **advisory artifacts** (handle-pivot sock; activity-fingerprint timezone — both `unverified`)
- `rare_nouns` analysis Cap (LIFE vs NEWS) — needs a real corpus surface
- Share / counsel reader links
- Offline pair sync / Mutation queue
- Plugin / sector packs
- Figma DS bridge (seat-gated)

---

## Explicitly out of scope

- Scratch / Candidate / promote / Door A/B product verbs
- Contested / Disproved as first-class types (use Retract + Question + Notes)
- Visual Playbook canvas / iPaaS
- Second hand-edited markdown SoT alongside Postgres
- Extending `_legacy-v1/` or `_legacy-v2/`
- NCMEC hashset without real access
- Cap catalog theater (registering dozens of stubs)

---

## Working backlog

### Phase 0

- [x] Deepen Evidence Process Caps (`evidence.harvest` + `evidence.extract.ai`)
- [x] Proposal create API + CLI path for agents
- [x] Graph write escape hatch (`userOverride` + `graph_writes` audit)
- [x] OpenAPI: Case create (`POST /cases` + `wd cases create`; conflict on slug)
- [x] OpenAPI/CLI: Case update + egress (`PATCH /cases/{id}` + `wd cases update`)
- [x] OpenAPI: evidence file upload / presign (`presign` + `confirmFile`)
- [x] CLI: evidence file (hash → presign → PUT → confirm)
- [x] Fix doc drift (`AGENTS.md` / `apps/web/AGENTS.md` / `env.example` `WD_EXPORT_DIR`)
- [x] URL archive Cap (`network.url.enrich`)

### Phase 1

- [x] Next network Cap (CT + posture + archive/web/identity/threat/breach waves — catalog at 63)
- [x] Field-method Wave 1 (`ip` Identifiers, DNS/WHOIS interpret, Triage collision warn, harvest quote-mask/selectors, `web.media.oembed`, host-footprint/posture, person Question seeds)
- [x] Jobs Capability discoverability polish (CapMatch / paste-to-run + filters + empty-default Cap select)
- [x] Cmd+K command palette + global hotkeys (Active Case `searchCase` + Jump to; Mod+B; `?`)
- [x] Identifier value validation (`validateIdentifierWrite` on Graph writes; Triage blocks invalid ops)
- [x] Known-finding suppression for Cap → Triage spam (core + Collect/Triage explainability)
- [x] Jobs paste-to-run / CapMatch launcher

Phase 2–3 items stay as bullets above until earned — don’t checkbox-dream them.

---

## Doc map

| Doc | Owns |
| --- | --- |
| **This file** | Phases, backlog, maturity, legacy mines |
| [`docs/explanation/product.md`](docs/explanation/product.md) | Nouns, hard bets, Cap loop, intent, personas, doctrine, rewrite lessons |
| [`AGENTS.md`](AGENTS.md) | Operational rules |
| [`docs/`](docs/README.md) | Platform architecture / UX / types / scenarios |
| [`docs/reference/web/`](docs/reference/web/README.md) | UI / DATA / domains / web architecture |
| [`docs/explanation/ux.md`](docs/explanation/ux.md) | Experience debt (dated) |
