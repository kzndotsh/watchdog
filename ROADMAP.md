# Watchdog ROADMAP

Live plan only; finished work is in git history. Nouns, Cap loop rules, intent, personas and doctrine: [`docs/explanation/product.md`](docs/explanation/product.md). UI contracts: [`docs/reference/web/`](docs/reference/web/README.md). Update this file when an item ships or a deferred one is earned; do not start a second `TODO.md`.

**North star:** small-team (often 1-2) OSINT. One **Case Graph** of Claims + Evidence you can defend, while collection stays fast. Loop: Collect → Decide (Triage) → Graph under human custody → Export Case package. Caps and agents never write the Graph unchecked; Postgres is SoT and markdown Export is a projection.

## Open gaps

- **MCP server:** not built. Agents use the OpenAPI surface (`/api/v1`).
- **Contract-first oRPC:** the generated client contract is shipped; designing ahead of handlers is not. Until then the router is SoT (`minifyContractRouter` → `@watchdog/client`).
- **Playbooks:** linear chains only; no branching, no visual DAG.
- **URL dump → Evidence:** Enrich is a separate verb (UI + `wd evidence enrich`); the URL row carries no hash.
- **Multi-op partial Accept:** Accept is all-or-nothing in one transaction.
- **Hardened multi-tenancy:** orgs, invites and an automated isolation matrix ship; no billing and no external adversarial-tenant review.
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
- Postgres + object-storage backup/restore story
- Error monitoring (Sentry or equivalent)
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
