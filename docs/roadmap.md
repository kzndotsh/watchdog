# Watchdog ROADMAP

Live plan only; finished work is in git history. Nouns, Cap loop rules, intent, personas and doctrine: [`explanation/product.md`](explanation/product.md). UI contracts: [`reference/web/`](reference/web/README.md). Update this file when an item ships or a deferred one is earned; do not start a second `TODO.md`.

**North star:** small-team (often 1-2) OSINT. One **Case Graph** of Claims + Evidence you can defend, while collection stays fast. Loop: Collect → Decide (Triage) → Graph under human custody → Export Case package. Caps and agents never write the Graph unchecked; Postgres is SoT and markdown Export is a projection.

## Current phase: defensible and shippable

From the October 2026 audit. Specs and their open tickets on the tracker; the gate freeze in [`contributing/ci-gates.md`](contributing/ci-gates.md) applies until they are done.

- **Custody integrity ([#288](https://github.com/kzndotsh/watchdog/issues/288)):** database invariants, attribution and append-only Graph history, and the split database roles ship. Open: tombstone deletion, server-verified Evidence uploads, Cap provenance and egress truth, edit conflicts, refusing Graph writes with no history actor.
- **Hardening ([#289](https://github.com/kzndotsh/watchdog/issues/289)):** the hardened outbound client, security headers and the CORS allowlist ship. Open: scoped API keys and admin-only destructive actions, bounded inputs and pagination, bounded heavy work, the race harness, a breaking-change check on the OpenAPI spec.
- **Shippable ([#290](https://github.com/kzndotsh/watchdog/issues/290)):** AGPL-3.0 with a CLA, the container image, safe first install, the operator guides (reverse proxy, backup and restore, upgrade) and vault key rotation ship. Open: release automation and published images, error reporting, the Cap register with breach Caps opt-in.

## Open gaps

- **MCP server:** not built. Agents use the OpenAPI surface (`/api/v1`).
- **Contract-first oRPC:** the generated client contract is shipped; designing ahead of handlers is not. Until then the router is SoT (`minifyContractRouter` → `@watchdog/client`); breaking changes are to be caught by a spec diff ([#353](https://github.com/kzndotsh/watchdog/issues/353)).
- **Playbooks:** linear chains only; no branching, no visual DAG. A failed step still abandons the whole run ([#354](https://github.com/kzndotsh/watchdog/issues/354)).
- **URL dump → Evidence:** Enrich is a separate verb (UI + `wd evidence enrich`); the URL row carries no hash.
- **Multi-op partial Accept:** Accept is all-or-nothing in one transaction.
- **Hardened multi-tenancy:** orgs, invites, an automated isolation matrix and a non-owner application database role ship; no billing, no per-organization quotas and no external adversarial-tenant review. Self-host first is the deployment target.
- **Scrape UX, vault import, corpus, LE packs:** not built; earned later.

## Phase 2: scale when it hurts

Only when Case load or workflow demands it.

- Scrape checkpoint UX
- Vault `graph/` → Case import
- Graph Studio (Cap context + full `/graph` canvas; the dossier 1-hop neighborhood ships)
- MCP over the same OpenAPI / Caps
- Dual-control Accept for identity merges
- `network.*.monitor` (baseline snapshot vs next Job → CHANGE/NEW/GONE); needs scheduled Jobs
- Cross-entity correlation Cap (`shares_ip_with` / shared NS/MX); Caps cannot read the Case, and the Triage identifier-collision warn is the shipped 80%
- External tools hub (link-out, not Caps)
- Ops `.audit/` hash-chain / `evlog/ai`
- Deeper Cap quality (IntelX, CIRCL PDNS)

## Phase 3: dream, each needs a written decision first

- Corpus browse + quarantine (illegal content = pointer, not bytes)
- LE referral / MISP / TheHive report packs (after Export is trusted)
- Ambient Copilot (propose-only)
- Sock / ACH / red-team Caps as **advisory artifacts** (handle-pivot sock; activity-fingerprint timezone; both `unverified`)
- `rare_nouns` analysis Cap (LIFE vs NEWS); needs a real corpus surface
- Share / counsel reader links
- Offline pair sync / Mutation queue
- Plugin / sector packs
- Figma DS bridge (seat-gated)

## Explicitly out of scope

- Scratch / Candidate / promote / Door A/B product verbs
- Contested / Disproved as first-class types (use Retract + Question + Notes)
- Visual Playbook canvas / iPaaS
- A second hand-edited markdown SoT alongside Postgres
- NCMEC hashset without real access
- Cap catalog theater (registering dozens of stubs)
