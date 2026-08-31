# Caps — naming, lexicon, ship gates

**What this is:** Cap id / title / kind lexicon, method vocabulary, pre-code decisions (D1–D5), and ship-gate rules for catalog growth.  
**Not:** Cap SPI details (see [`ARCHITECTURE.md`](README.md) § Caps) or Job runner internals.

**Catalog size:** `pnpm generate:caps` currently emits **63** CapDescriptors (Collect/enrich/process/act across network · archive · web · identity · breach · threat · evidence). Growth is gated by the ship-gate table below — not by the original first-slate “≈28” ceiling (that was the Day-0 honest floor; later waves earned beyond it and are listed under Public vs paid).

<!-- check:agents allow-banned -->

Refuse in UI/docs/Cap titles (competitor / legacy theater): module · analyzer · neuron · enricher · transform · connector · Mutation · Scratch · Candidate · Promote. UI says **Cap**; SPI may say `CapabilityDef`.
<!-- check:agents allow-banned -->

## Pre-code decisions (locked)

| # | Decision | Chosen |
| --- | --- | --- |
| **D1** | Hostname / CT / DNS landing shape | `domain` and `ip` are `IDENTIFIER_TYPES` values. CT (and later subdomain) Caps propose `domain` Identifiers; DNS A/AAAA propose `ip`. NS/MX stay in the observation Claim (shared infra, not Identifiers). Do **not** use `other` as escape hatch. |
| **D2** | Passive vs active machine surface | Active Caps: `flags: ["invasive"]` **and** `useCases` including `"Active"`. Passive footprint: `useCases: ["Passive","Footprint"]` (and no `invasive`). Applies to `kind: act` too when attributable (e.g. `archive.url.submit`). Do not rely on description prose alone. |
| **D3** | Noun “posture” methods | **Named-check exemption:** posture/protocol Caps may use dimension names as slot-3 (`mail_config`, `tls_audit`, `http_probe`, `jarm`, `oembed`); must be `kind: collect` + correct invasive/useCases. Still ban free noun-methods for content signals (`social_meta`, `trackers`, `cdx`, `metadata`). |
| **D4** | One request set per origin | Do **not** split headers / security.txt / favicon / CDN into four Caps. **One** `network.host.http_probe`. Keep `tls_audit` separate (TLS handshake ≠ HTTP GET). |
| **D5** | Breach corpus credential bodies | Paid corpus Caps (`breach.dehashed.lookup`, `breach.snusbase.lookup`, and peers) **may** store recovered emails/usernames/passwords/hashes in Evidence and sample them in Claims for Accept. Cap-vault API keys and `Job.logs` / evlog stay secret-free. Metadata-only sources (HIBP, Hudson Rock) stay metadata-only because the **API** does not return plaintext — not because Watchdog forbids storing it. |

## Three layers (never collapse)

| Layer | Audience | Rules |
| --- | --- | --- |
| **id** | agents, registry, playbooks, logs | `<category>.<salient_axis>.<method>` — exactly 3 segments, lowercase, snake_case tokens |
| **title** | Jobs picker / Job row | Investigator speech. Source-axis Caps **may** use the vendor name (`Shodan lookup`) |
| **kind** | filters / badges | `collect` \| `enrich` \| `process` \| `act` |

Path: `packages/caps/src/<category>/<axis>.<method>/` (e.g. `network/ct.lookup/`).

Playbook ids: kebab-case, no dots; first token === `seedKinds[0]`. Cap ids keep dots.

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
| `corpus` | What’s in our corpus? | (defer) |
| `crypto` | Where does the money go? | (defer) |
| `analysis` | How do we reason about this? | Analysis |
| `evidence` | What can we pull from this held file/dump? | Evidence |
| `report` | What do we deliver? | Prefer product Export |
| `safety` | What can’t we touch? | (defer) |
| `threat` | Is this flagged elsewhere? | Reputation |

Jobs category grouping derives from `id.split(".")[0]` until `CapDescriptor` grows an explicit field. Intent labels use `useCases`: `Passive` · `Active` · `Footprint`.

### Category boundaries

- **`web`** = live HTTP **content** / site surface — not “anything with a URL.”
- HTTP **response metadata** and well-known **posture** files (`security.txt`, headers, favicon hash, CDN hints) = **`network`** posture (`http_probe`).
- Rendered page markup (OG/JSON-LD, tracker script IDs) = **`web`** (`web.page.enrich`).
- Historical snapshots / CDX = **`archive`**.
- `network.url.enrich` stays **network** (Intake Job artifacts for a URL seed).
- Code-host account lookup = **`identity.github.lookup`**, not `web.*`. No broad code-host _search_ Cap ships today; if one lands it belongs in `breach` (leaked-secret sweeps) or `identity` (account discovery) depending on what it returns.

### Salient axis

- **source** when a named API is identity-bearing (`shodan`, `wayback`, `github`, `virustotal`, `hibp`, `whoxy`).
- Else **target** (`dns`, `domain`, `url`, `host`, `email`, `ct`, `ip`, `page`, `file`, `eml`, …).
- Axis list is **open with process** — new axes OK when they answer the category question; prefer existing tokens.

**Id note:** `network.ct.lookup` (not `cert`) — `ct` = Certificate Transparency **logs**; `cert` reads like live TLS cert fetch (overlaps `tls_audit`). Title: `Certificate transparency`.

## Method vocabulary (slot 3)

Convention, not enforcement: `CapabilityDef.id` is a plain `string` and no schema validates slot 3. The hygiene tests in `packages/caps/src/__tests__/capabilities-gen.test.ts` are the only automated check, so keeping this list honest is on the author.

Each verb has one meaning. Prefer a root verb; compounds must root in one below.

### Retrieve

| Method     | Definition                                                   |
| ---------- | ------------------------------------------------------------ |
| **fetch**  | Pull raw bytes/HTML into Job/Evidence storage; park material |
| **mirror** | Structural copy of a live site                               |
| **crawl**  | Traverse a link graph; point is the map                      |

### Query

| Method | Definition |
| --- | --- |
| **lookup** | One direct query → one structured snapshot. Recursive DNS resolver queries = **lookup** (not probe). Third-party indexes (crt.sh, Shodan) = **lookup** |
| **reverse** | Inverse of a forward lookup for the same axis — today `network.dns.reverse` (PTR). Still passive; not a probe |
| **search** | Broad query → many hits |
| **scan** | Pattern pass over held content |
| **probe** | Actively interrogate **target live infra** (port/TLS handshake/posture HTTP). Detectable → `invasive` + `Active` |
| **enumerate** | One seed → many candidate subjects (needs ≥2 named sources — don’t ship the same CT vendor twice). CT sources today: `network.ct.lookup` (crt.sh) + `network.certspotter.lookup`. Until a real multi-source enumerate Cap ships, use source-axis Caps (e.g. `network.c99.lookup`) |

### Decorate / relate / preserve / produce

| Method | Definition |
| --- | --- |
| **enrich** | Deepen existing subject (attributes / Job artifacts) without changing identity |
| **unshorten** | Resolve a redirect chain to its final URL — today `web.url.unshorten` |
| **crossref** | Where-else candidates — never identity proof; Maigret-class deferred to external tools hub |
| **capture** | Full citable Evidence pipeline for a URL |
| **submit** | Push URL to archive for **our** preservation (public record — opt-in + third_party egress) |
| **analyze** | Structure a held file into a findings draft |
| **assess** | Tradecraft reasoning artifact — **deferred** until analysis-artifact SoT exists |
| **validate** / **monitor** / **import** / **ingest** / **export** / **share** / **classify** / **compare** / **cluster** | See legacy method notes; use when Cap earns a number |

### Named-check compounds (D3)

Allowed slot-3 tokens for posture: `mail_config`, `txt_inventory`, `tls_audit`, `http_probe`, `jarm`, `dnssec`, `oembed`, … — rooted in probe/enrich of a dimension.

**Banned as new methods:** bare `extract` (grandfather `evidence.extract.ai` only); noun content methods `social_meta`, `trackers`, `cdx`, `metadata` — use `web.page.enrich`, `archive.wayback.lookup`, `evidence.file.analyze`.

### Authoring picker

1. Raw bytes? → fetch / mirror / crawl
2. One index answer? → lookup (or **reverse** for PTR / inverse of the same axis)
3. Many subjects from one seed? → enumerate (only with real multi-source)
4. Patterns on held content? → scan (or harvest extractor)
5. Target live infra? → probe (+ invasive)
6. Deepen subject? → enrich
7. Where-else ID? → crossref (hub until earned)
8. Citable URL Evidence? → capture
9. Push to archive? → submit
10. Held file → draft? → analyze

## Public vs paid

**One Cap ≈ one source contract.** Split when the paid product is identity-bearing or answers a different question (e.g. RDAP `network.whois.lookup` vs paid `network.whoisxml.lookup`). Never “DNS lookup with optional Shodan,” and don’t bury a second source as silent failover.

**Public free APIs (SpiderFoot snags):** `network.ipctl.lookup` (BGPView replacement — BGPView shut down), `network.hackertarget.lookup`, `network.urlscan.lookup`, `network.mnemonic.lookup`, `network.certspotter.lookup`, `identity.keybase.lookup`, `identity.gravatar.lookup`, `archive.commoncrawl.lookup`, `threat.hashlookup.lookup`, `threat.bgpranking.lookup`, `threat.dshield.lookup`, `network.tor_exit.lookup`, `network.tranco.lookup`, `threat.cymru_mhr.lookup`, `threat.firehol.lookup`, `threat.feodo.lookup` (optional Auth-Key), `threat.greedybear.lookup` (public scanner feeds — not gated enrichment), `web.media.oembed` (vendor oEmbed JSON — YouTube / Vimeo / Flickr / SoundCloud / TikTok / Spotify). **Keyed free:** `threat.threatfox.lookup` / `threat.urlhaus.lookup` / `threat.malwarebazaar.lookup` (shared abuse.ch Auth-Key vault `THREATFOX_API_KEY`), `threat.greynoise.lookup` (optional Community key), `threat.otx.lookup`, `threat.safebrowsing.lookup`, `threat.xforce.lookup`, `threat.honeydb.lookup`, `network.leakix.lookup`, `identity.emailrep.lookup` (requires `EMAILREP_API_KEY`; unauthenticated API is disabled), `breach.hudsonrock.lookup`, `network.urlscan.submit` (live scan, distinct from public `network.urlscan.lookup` search), `network.ipinfo.lookup` (requires `IPINFO_API_TOKEN`; GeoIP/org, complements Team Cymru `network.ip.lookup`). grep.app / searchcode public JSON APIs were blocked or 404 — skipped.

**Paid:** `breach.dehashed.lookup`, `breach.snusbase.lookup` — full recovered rows in Evidence (incl. password/hash, capped); Claim carries a short sample for Accept (**D5**). Never put those bodies in `Job.logs` / evlog.

**Cut / defer (not Caps):** Spamhaus free DBL; Talos scrape; CheckPhish-as-Collect; CIRCL PDNS/PSSL until partner access; SecurityTrails/DNSDB/RiskIQ/RecordedFuture; scanner clones (ONYPHE/ZoomEye/Netlas/BinaryEdge); Maigret-class → tools hub; GreedyBear enrichment until Honeynet token grant.

## Ship gates

A Cap stays **unnumbered backlog** until all are filled:

| Gate | Example |
| --- | --- |
| Interpret target | `ip` / `domain` Identifiers + summary Claim, or Claim-only / none |
| Named source | crt.sh, system resolver, … |
| Credential | none / `SHODAN_API_KEY` / … |
| Passive/active | useCases + invasive flag |
| Egress | `none` / `third_party` / call-site check |

**DNS / WHOIS interpret:** DNS A/AAAA → `ip` Identifiers; NS/MX stay in the Claim. Shared `interpretWhoisSnapshot` — observation Claim (NS in prose) + optional Event when `expiresAt` is in the past or within 90 days. Cached reports may omit dates (`.nullish()`). Invalid WHOIS dates parse to `null`.

## Playbooks

Curated linear recipes. First id token === `seedKinds[0]`. Caps stay individually runnable from Jobs. `planPlaybook` validates the whole recipe and emits step 0 only; later Jobs are created when the prior step succeeds. Job status `blocked` is historical only — lazy-release playbooks no longer pre-insert blocked rows.

**Seeds:** `host` · `url` · `evidence` · `ip` · `email` · `hash` · `handle`. Email/handle map to Cap IO `identifier` (type email/handle). Caps whose Zod field is `query` receive it from the primary seed (email → handle → ip → url → host). A url seed also derives `host` so archive/host Caps can sit in a url-seeded book.

**Bind (enqueue time):** next-step input is filled from the playbook seed, predecessor `jobs.evidenceIds`, or predecessor `jobs.handoff` bags when that step is created. Caps may declare optional `handoff(report)` (persisted on Job success, including cache hits). Do not bind from Triage Proposals. `url-capture` harvest still uses the **seed** Evidence id (timing only).

**Fan-out:** a step may explode into N Jobs (`playbookFanIndex` 0..n-1, cap default 25). Empty list skips the step and finishes/continues — it does not fail the run. Create the next recipe step only when **all** siblings at the current step are terminal. One sibling failure does not cancel the others; later static steps require ≥1 sibling success.

**Out of default books:** `archive.url.submit` / `network.urlscan.submit` (act / public records); harvest+`evidence.extract.ai` in one recipe; CDX auto-fetch of snapshots; threat mega-piles (run keyed Caps from Jobs).

Shipped starter set includes same-seed books (`host-footprint`, `host-posture`, `host-reputation`, url/ip/email/hash/handle recipes), bind books (`host-contacts`, `url-resolve`, `evidence-file`), and `host-enumerate` (CT → per-host DNS, max 25). Public identity / hash / URL reputation books stay keyless; keyed siblings are `email-identity-plus`, `hash-malware-plus`, and `url-reputation-plus`.

## Overlap matrix (URL / page / archive)

| Cap | Role |
| --- | --- |
| `network.url.enrich` | Intake: live + Wayback → Job-internal md; no Proposal |
| `archive.wayback.lookup` / `fetch` | Jobs-first Wayback; **shared** `@watchdog/tools` CDX client with enrich |
| `archive.url.submit` | Push URL to Wayback SPN — **creates a public archive record**; `kind: act`, `egress: third_party` |
| `web.page.enrich` | Live HTML → meta + trackers → Proposal when entity set |
| `web.media.oembed` | Public vendor oEmbed JSON for a media URL → `@handle` + url Identifiers (run from Jobs; harvest does not emit an oEmbed Question) |

## Grandfathered

- `evidence.harvest` (2 segments)
- `evidence.extract.ai` (bare `extract` — no new `extract.*` siblings)

## See also

| Need | Doc |
| --- | --- |
| Cap SPI / Jobs path | [`ARCHITECTURE.md`](README.md) |
| Identifier vocab | [`TYPES.md`](types.md) |
| Cap package layout | [`packages/caps/AGENTS.md`](../../../packages/caps/AGENTS.md) |
| Product refuse list | [`PRODUCT.md`](../../explanation/product.md) |
