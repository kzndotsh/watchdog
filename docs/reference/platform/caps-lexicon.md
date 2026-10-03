# Caps: naming, lexicon, ship gates

**What this is:** Cap id / title / kind lexicon, method vocabulary, pre-code decisions (D1-D5), ship gates for catalog growth, playbook rules.  
**What this is not:** Cap SPI ([`caps-boundary.md`](caps-boundary.md)) or Job runner internals ([`jobs-orpc.md`](jobs-orpc.md)). The catalog itself is `packages/caps/capabilities.gen.json` (`pnpm generate:caps`); do not copy Cap lists or counts here.

## What is enforced

Everything in this page is **guidance** unless named here.

| Rule | Enforced by |
| --- | --- |
| `capabilities.gen.json` matches live Caps | `packages/caps/src/__tests__/capabilities-gen.test.ts` + CI "CapDescriptor drift" |
| Playbook ids: kebab-case, no dots, first token === `seedKinds[0]`, at least two Caps | `packages/caps/src/playbooks/__tests__/naming.test.ts` |
| Cap ids are `<category>.<axis>.<method>` (3 segments), lowercase snake_case, path mirrors id | nothing: `CapabilityDef.id` is a plain `string` and no test checks shape. `evidence.harvest` (2 segments) is the one exception today |
| Method vocabulary, categories, D1-D5, ship gates | review |
| Refuse words below | `pnpm check:agents:strict` bans the `_Banned_` terms of [`GLOSSARY.md`](../../../GLOSSARY.md), and only in `AGENTS.md` files. The rest is review |

Refuse in UI, docs and Cap titles: module · analyzer · neuron · enricher · transform · connector, plus the retired terms and `_Avoid_` words in [`GLOSSARY.md`](../../../GLOSSARY.md). UI says **Cap**; SPI may say `CapabilityDef`.

## Pre-code decisions (locked)

| # | Decision | Chosen |
| --- | --- | --- |
| **D1** | Hostname / CT / DNS landing shape | `domain` and `ip` are `IDENTIFIER_TYPES` values. CT (and later subdomain) Caps propose `domain` Identifiers; DNS A/AAAA propose `ip`. NS/MX stay in the observation Claim (shared infra, not Identifiers). Do **not** use `other` as an escape hatch. |
| **D2** | Passive vs active machine surface | Active Caps: `flags: ["invasive"]` **and** `useCases` including `"Active"`. Passive footprint: `useCases: ["Passive","Footprint"]` and no `invasive`. Applies to `kind: act` too when attributable (e.g. `archive.url.submit`). Do not rely on description prose alone. |
| **D3** | Noun "posture" methods | **Named-check exemption:** posture/protocol Caps may use dimension names as slot 3 (`mail_config`, `tls_audit`, `http_probe`, `jarm`, `oembed`); they must be `kind: collect` with correct invasive/useCases. Still ban free noun-methods for content signals (`social_meta`, `trackers`, `cdx`, `metadata`). |
| **D4** | One request set per origin | Do **not** split headers / security.txt / favicon / CDN into four Caps. **One** `network.host.http_probe`. Keep `tls_audit` separate (a TLS handshake is not an HTTP GET). |
| **D5** | Breach corpus credential bodies | Paid corpus Caps (`breach.dehashed.lookup`, `breach.snusbase.lookup`, and peers) **may** store recovered emails/usernames/passwords/hashes in Evidence and sample them in Claims for Accept. Cap-vault API keys and `Job.logs` / evlog stay secret-free ([`../contracts/evlog.md`](../contracts/evlog.md)). Metadata-only sources (HIBP, Hudson Rock) stay metadata-only because their **API** does not return plaintext, not because Watchdog forbids storing it. |

## Three layers (never collapse)

| Layer | Audience | Rule |
| --- | --- | --- |
| **id** | agents, registry, playbooks, logs | `<category>.<salient_axis>.<method>`, three segments |
| **title** | Jobs picker / Job row | Investigator speech. Source-axis Caps **may** use the vendor name (`Shodan lookup`) |
| **kind** | filters / badges | `collect` \| `enrich` \| `process` \| `act` |

Path: `packages/caps/src/<category>/<axis>.<method>/` (e.g. `network/ct.lookup/`).

### `enrich` triple (do not conflate)

| Word | Layer | Means |
| --- | --- | --- |
| `kind: enrich` | Cap kind | Job role: Job-internal artifacts; usually no `interpret` / Proposal |
| method `enrich` | id slot 3 | Deepen an existing subject with structured context |
| Intake **Enrich** | Product verb | Starts `network.url.enrich` from a URL Evidence row |

## Reserved categories (12)

| Category | Feature question | Jobs group label |
| --- | --- | --- |
| `network` | What is this host / domain / IP as infra? | Infrastructure |
| `archive` | What was here before? | Archives |
| `web` | What is on this live site/page right now? | Live web |
| `identity` | Who is this handle / email / key? | Identity |
| `breach` | What leaked / exposed in the wild? | Breaches |
| `corpus` | What's in our corpus? | (defer) |
| `crypto` | Where does the money go? | (defer) |
| `analysis` | How do we reason about this? | Analysis |
| `evidence` | What can we pull from this held file/dump? | Evidence |
| `report` | What do we deliver? | Prefer product Export |
| `safety` | What can't we touch? | (defer) |
| `threat` | Is this flagged elsewhere? | Reputation |

Jobs category grouping derives from `id.split(".")[0]`. Intent labels use `useCases`: `Passive` · `Active` · `Footprint`.

### Category boundaries

- **`web`** = live HTTP **content** / site surface, not "anything with a URL."
- HTTP **response metadata** and well-known **posture** files (`security.txt`, headers, favicon hash, CDN hints) = **`network`** posture (`http_probe`).
- Rendered page markup (OG/JSON-LD, tracker script IDs) = **`web`** (`web.page.enrich`).
- Historical snapshots / CDX = **`archive`**.
- `network.url.enrich` stays **network** (Intake Job artifacts for a URL seed).
- Code-host account lookup = **`identity.github.lookup`**, not `web.*`. A code-host _search_ Cap, if one lands, belongs in `breach` (leaked-secret sweeps) or `identity` (account discovery) depending on what it returns.

### Salient axis

- **source** when a named API is identity-bearing (`shodan`, `wayback`, `github`, `virustotal`, `hibp`, `whoxy`).
- Else **target** (`dns`, `domain`, `url`, `host`, `email`, `ct`, `ip`, `page`, `file`, `eml`, …).
- The axis list is open: new axes are fine when they answer the category question; prefer existing tokens.

Example: `network.ct.lookup`, not `cert`. `ct` = Certificate Transparency **logs**; `cert` reads like a live TLS fetch and overlaps `tls_audit`.

## Method vocabulary (slot 3)

Each verb has one meaning. Prefer a root verb; compounds must root in one below.

| Method | Definition |
| --- | --- |
| **fetch** | Pull raw bytes/HTML into Job/Evidence storage; park material |
| **mirror** | Structural copy of a live site |
| **crawl** | Traverse a link graph; the point is the map |
| **lookup** | One direct query → one structured snapshot. Recursive DNS resolver queries and third-party indexes (crt.sh, Shodan) are **lookup** |
| **reverse** | Inverse of a forward lookup on the same axis (`network.dns.reverse`, PTR). Passive, not a probe |
| **search** | Broad query → many hits |
| **scan** | Pattern pass over held content |
| **probe** | Actively interrogate **target live infra** (port, TLS handshake, posture HTTP). Detectable → `invasive` + `Active` |
| **enumerate** | One seed → many candidate subjects. Needs at least two named sources; do not ship the same vendor twice. Until a real multi-source enumerate Cap ships, use source-axis Caps |
| **enrich** | Deepen an existing subject (attributes / Job artifacts) without changing identity |
| **unshorten** | Resolve a redirect chain to its final URL |
| **crossref** | Where-else candidates: never identity proof; Maigret-class work is deferred to external tools |
| **capture** | Full citable Evidence pipeline for a URL |
| **submit** | Push a URL to an archive for **our** preservation (public record: opt-in + third_party egress) |
| **analyze** | Structure a held file into a findings draft |
| **assess** | Tradecraft reasoning artifact: deferred until an analysis-artifact SoT exists |
| validate · monitor · import · ingest · export · share · classify · compare · cluster | Reserved; define the meaning when a Cap earns it |

**Named-check compounds (D3):** allowed slot-3 posture tokens include `mail_config`, `txt_inventory`, `tls_audit`, `http_probe`, `jarm`, `dnssec`, `oembed`. **Banned as new methods:** bare `extract` (grandfathered: `evidence.extract.ai` only; no new `extract.*` siblings) and noun content methods `social_meta`, `trackers`, `cdx`, `metadata`; use `web.page.enrich`, `archive.wayback.lookup`, `evidence.file.analyze`.

**Authoring picker:** raw bytes → fetch / mirror / crawl; one index answer → lookup (or reverse); many subjects from one seed → enumerate; patterns on held content → scan; target live infra → probe (+ invasive); deepen a subject → enrich; where-else → crossref; citable URL Evidence → capture; push to archive → submit; held file → draft → analyze.

## Public vs paid

**One Cap ≈ one source contract** (D4). Split when the paid product is identity-bearing or answers a different question (RDAP `network.whois.lookup` vs paid `network.whoisxml.lookup`). Never "DNS lookup with optional Shodan", and do not bury a second source as silent failover. Free, keyed-free and paid Caps are told apart in each Cap's `credentials` and `egress` in `capabilities.gen.json`. Paid corpus Caps follow D5.

**Cut / defer (not Caps):** Spamhaus free DBL; Talos scrape; CheckPhish-as-Collect; CIRCL PDNS/PSSL until partner access; SecurityTrails / DNSDB / RiskIQ / RecordedFuture; scanner clones (ONYPHE / ZoomEye / Netlas / BinaryEdge); Maigret-class → tools hub; GreedyBear enrichment until a Honeynet token grant.

## Ship gates

A Cap stays **unnumbered backlog** until all are filled:

| Gate | Example |
| --- | --- |
| Interpret target | `ip` / `domain` Identifiers + summary Claim, or Claim-only / none |
| Named source | crt.sh, system resolver, … |
| Credential | none / `SHODAN_API_KEY` / … |
| Passive/active | useCases + invasive flag |
| Egress | `none` / `third_party` / call-site check |

Catalog growth is gated by this table, not by a size ceiling.

**DNS / WHOIS interpret:** DNS A/AAAA → `ip` Identifiers; NS/MX stay in the Claim. Shared `interpretWhoisSnapshot`: observation Claim (NS in prose) + optional Event when `expiresAt` is in the past or within 90 days. Cached reports may omit dates (`.nullish()`); invalid WHOIS dates parse to `null`.

## Playbooks

Curated linear recipes (`packages/caps/src/playbooks/definitions.ts`). Caps stay individually runnable from Jobs. `planPlaybook` validates the whole recipe and emits step 0 only; later Jobs are created when the prior step succeeds (`blocked` Job status is historical).

- **Seeds:** `host` · `url` · `evidence` · `ip` · `email` · `hash` · `handle`. Email/handle map to Cap IO `identifier`. Caps whose Zod field is `query` receive it from the primary seed (email → handle → ip → url → host). A url seed also derives `host`.
- **Bind (enqueue time):** next-step input is filled from the playbook seed, predecessor `jobs.evidenceIds`, or predecessor `jobs.handoff` bags (Caps may declare `handoff(report)`; persisted on success, including cache hits). Do not bind from Triage Proposals.
- **Fan-out:** a step may explode into N Jobs (`playbookFanIndex` 0..n-1, default cap 25). An empty list skips the step; it does not fail the run. The next step is created only when all siblings at the current step are terminal; one sibling failure does not cancel the others, and later static steps need at least one sibling success.
- **Out of default books:** `archive.url.submit` and `network.urlscan.submit` (act / public records); harvest + `evidence.extract.ai` in one recipe; CDX auto-fetch of snapshots; threat mega-piles (run keyed Caps from Jobs). Public identity/hash/URL reputation books stay keyless; keyed siblings carry a `-plus` suffix.

## See also

- Cap SPI and Jobs path: [`caps-boundary.md`](caps-boundary.md), [`jobs-orpc.md`](jobs-orpc.md)
- Identifier vocabulary: [`types.md`](types.md)
- Cap package layout: [`packages/caps/AGENTS.md`](../../../packages/caps/AGENTS.md)
- Product refuse list: [`../../explanation/product.md`](../../explanation/product.md)
