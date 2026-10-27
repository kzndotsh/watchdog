# Watchdog ROADMAP

Live plan only; finished work is in git history. Nouns, Cap loop rules, intent, personas and doctrine: [`explanation/product.md`](explanation/product.md). UI contracts: [`reference/web/`](reference/web/README.md). Update this file when an item ships or a deferred one is earned; do not start a second `TODO.md`.

**North star:** small-team (often 1-2) OSINT. One **Case Graph** of Claims + Evidence you can defend, while collection stays fast. Loop: Collect → Decide (Triage) → Graph under human custody → Export Case package. Caps and agents never write the Graph unchecked; Postgres is SoT and markdown Export is a projection.

## Current phase: defensible and shippable

From the October 2026 audit. The custody and hardening specs ([#288](https://github.com/kzndotsh/watchdog/issues/288), [#289](https://github.com/kzndotsh/watchdog/issues/289)) and the shippable spec's license, image, operator guides, error reporting and Cap register ([#290](https://github.com/kzndotsh/watchdog/issues/290)) have shipped; the gate freeze in [`contributing/ci-gates.md`](contributing/ci-gates.md) applies until #290 closes. Open on the tracker:

- **Release automation ([#310](https://github.com/kzndotsh/watchdog/issues/310)):** published images, one version everywhere, an SBOM. The last open ticket under #290.
- **Own CLA workflow ([#328](https://github.com/kzndotsh/watchdog/issues/328)):** repo-canonical, no third party; starts when the first outside pull request arrives. Until then the maintainer checks the CLA comment by hand.
- **Drizzle 1.0 ([#446](https://github.com/kzndotsh/watchdog/issues/446)):** on the Effect Postgres driver; the last open ticket under [#442](https://github.com/kzndotsh/watchdog/issues/442).
- **CI critical path ([#253](https://github.com/kzndotsh/watchdog/issues/253)):** the last open ticket under [#250](https://github.com/kzndotsh/watchdog/issues/250).
- **Gate simplification ([#355](https://github.com/kzndotsh/watchdog/issues/355)):** one pass of deletions and merges over the gate apparatus.

## Open gaps

- **MCP server:** not built. Agents use the OpenAPI surface (`/api/v1`).
- **Contract-first oRPC:** the generated client contract is shipped; designing ahead of handlers is not. Until then the router is SoT (`minifyContractRouter` → `@watchdog/client`); CI diffs the OpenAPI spec for breaking changes (oasdiff, [`ci-gates`](contributing/ci-gates.md#openapi-breaking-changes)).
- **Playbooks:** linear chains only; no branching, no visual DAG. A failed step skips only the steps that read its output, and a run finishes `succeeded`, `partial` or `failed`.
- **URL dump → Evidence:** Enrich is a separate verb (UI + `wd evidence enrich`); the URL row carries no hash.
- **Multi-op partial Accept:** Accept is all-or-nothing in one transaction.
- **Hardened multi-tenancy:** orgs, invites, an automated isolation matrix and a non-owner application database role and per-organization and per-key Job start limits ship; no billing and no external adversarial-tenant review. Self-host first is the deployment target.
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
