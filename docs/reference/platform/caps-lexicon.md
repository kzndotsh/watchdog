# Caps: naming, lexicon, ship gates

**What this is:** Cap id / title / kind lexicon, method vocabulary, pre-code decisions (D1-D5), ship gates for catalog growth, playbook rules.  
**What this is not:** Cap SPI ([`caps-boundary.md`](caps-boundary.md)) or Job runner internals ([`jobs-orpc.md`](jobs-orpc.md)). The catalog itself is `packages/caps/capabilities.gen.json` (`pnpm generate:caps`); do not copy Cap lists or counts here.

## What is enforced

Everything in this page is **guidance** unless named here.

| Rule | Enforced by |
| --- | --- |
| `capabilities.gen.json` matches live Caps | `packages/caps/src/__tests__/capabilities-gen.test.ts` + CI "CapDescriptor drift" |
| `cap-register.md` matches the Caps' `provider` blocks | `packages/caps/src/__tests__/cap-register.test.ts` + CI "CapDescriptor drift" |
| Every Cap has a `provider` | type: `CapabilityDef.provider` is required (`packages/caps/src/sdk/define.ts`); `defineProvider` refuses a non-https link and a `self` provider that does not allow commercial use |
| Derived metadata is not repeated: no `needs_key` / `third_party` in `flags`, no `egress` field (the classes derive from `contacts`), no `reportLabel` equal to the id, no hard-coded `Watchdog/<v>` user agent | type: `CapabilityDef.flags` takes `slow` and `invasive` only; `watchdog/no-derived-cap-metadata` (`scripts/__tests__/oxlint-no-derived-cap-metadata.gate.test.ts`) |
| Playbook ids: kebab-case, no dots, first token === `seedKinds[0]`, at least two Caps | `packages/caps/src/playbooks/__tests__/naming.test.ts` |
| Cap ids are `<category>.<axis>.<method>` (3 segments), lowercase snake_case, path mirrors id | nothing: `CapabilityDef.id` is a plain `string` and no test checks shape. `evidence.harvest` (2 segments) is the one exception today |
| Method vocabulary, categories, D1-D5, ship gates | review |
| Refuse words below | `pnpm check:agents:strict` bans the `_Banned_` terms of [`glossary.md`](../../glossary.md), and only in `AGENTS.md` files. The rest is review |

Refuse in UI, docs and Cap titles: module · analyzer · neuron · enricher · transform · connector, plus the retired terms and `_Avoid_` words in [`glossary.md`](../../glossary.md). UI says **Cap**; SPI may say `CapabilityDef`.

## Pre-code decisions (locked)

| # | Decision | Chosen |
| --- | --- | --- |
| **D1** | Hostname / CT / DNS landing shape | `domain` and `ip` are `IDENTIFIER_TYPES` values. CT (and later subdomain) Caps propose `domain` Identifiers; DNS A/AAAA propose `ip`. NS/MX stay in the observation Claim (shared infra, not Identifiers). Do **not** use `other` as an escape hatch. |
| **D2** | Passive vs active machine surface | Active Caps: `flags: ["invasive"]` **and** `useCases` including `"Active"`. Passive footprint: `useCases: ["Passive","Footprint"]` and no `invasive`. Applies to `kind: act` too when attributable (e.g. `archive.url.submit`). Do not rely on description prose alone. |
| **D3** | Noun "posture" methods | **Named-check exemption:** posture/protocol Caps may use dimension names as slot 3 (`mail_config`, `tls_audit`, `http_probe`, `jarm`, `oembed`); they must be `kind: collect` with correct invasive/useCases. Still ban free noun-methods for content signals (`social_meta`, `trackers`, `cdx`, `metadata`). |
| **D4** | One request set per origin | Do **not** split headers / security.txt / favicon / CDN into four Caps. **One** `network.host.http_probe`. Keep `tls_audit` separate (a TLS handshake is not an HTTP GET). |
| **D5** | Breach corpus credential bodies | Paid corpus Caps (`breach.dehashed.lookup`, `breach.snusbase.lookup`, and peers) store recovered emails and usernames, and what they keep of passwords and hashes depends on `WD_BREACH_CAPS` ([modes](#breach-credentials-by-mode)): `safe` keeps no password and no hash in Evidence (only present, kind, length and a keyed reuse fingerprint), `full` keeps them and a Case Export redacts them unless an owner or admin includes them. A Claim never quotes a credential in either mode. Cap-vault API keys and `Job.logs` / evlog stay secret-free ([`../contracts/evlog.md`](../contracts/evlog.md)). Metadata-only sources (HIBP, Hudson Rock) stay metadata-only because their **API** does not return plaintext, not because Watchdog forbids storing it. `breach.leakradar.lookup` is masked-only by design: it has no route that unlocks (unlocking spends the account's paid points), never sends `auto_unlock`, and keeps an allowlist of masked fields, so no password or plaintext credential is returned or stored. |

## Three layers (never collapse)

| Layer | Audience | Rule |
| --- | --- | --- |
| **id** | agents, registry, playbooks, logs | `<category>.<salient_axis>.<method>`, three segments |
| **title** | Jobs picker / Job row | Investigator speech. Source-axis Caps **may** use the vendor name (`Shodan lookup`) |
| **description** | Library cards and pages | One or two plain sentences: what you give it and what you get back, plus at most one caveat where it changes how a result reads ("Past resolutions do not show ownership"). No dashes or arrows, no internal terms (Job Output, Accept, vault slot), no other Cap or Playbook ids, and no key, plan or price notes: the Library shows readiness and plan beside it. Playbook descriptions follow the same rule |
| **kind** | filters / badges | `collect` \| `enrich` \| `process` \| `act` |

Path: `packages/caps/src/<category>/<axis>.<method>/` (e.g. `network/ct.lookup/`).

### `enrich` triple (do not conflate)

| Word | Layer | Means |
| --- | --- | --- |
| `kind: enrich` | Cap kind | Job role: Job-internal artifacts; usually no `interpret` / Proposal |
| method `enrich` | id slot 3 | Deepen an existing subject with structured context |
| Intake **Enrich** | Product verb | Starts `network.url.enrich` from a URL Evidence row |

## Reserved categories (12)

| Category | Feature question | Label in Collect and the Library |
| --- | --- | --- |
| `network` | What is this host / domain / IP as infra? | Network |
| `archive` | What was here before? | Archive |
| `web` | What is on this live site/page right now? | Web |
| `identity` | Who is this handle / email / key? | Identity |
| `breach` | What leaked / exposed in the wild? | Breach |
| `corpus` | What's in our corpus? | (defer) |
| `crypto` | Where does the money go? | (defer) |
| `analysis` | How do we reason about this? | Analysis |
| `evidence` | What can we pull from this held file/dump? | Evidence |
| `report` | What do we deliver? | Prefer product Export |
| `safety` | What can't we touch? | (defer) |
| `threat` | Is this flagged elsewhere? | Threat |

Collect and the Library group by `id.split(".")[0]` and label the group with it capitalized (`categoryLabel` in `apps/web/src/shared/lib/cap-category.ts`). Intent labels use `useCases`: `Passive` · `Active` · `Footprint`.

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
| **submit** | Push a URL to an archive for **our** preservation (public record: opt-in; an archive is a `public_lookup` Contact the Case must allow) |
| **analyze** | Structure a held file into a findings draft |
| **assess** | Tradecraft reasoning artifact: deferred until an analysis-artifact SoT exists |
| validate · monitor · import · ingest · export · share · classify · compare · cluster | Reserved; define the meaning when a Cap earns it |

**Named-check compounds (D3):** allowed slot-3 posture tokens include `mail_config`, `txt_inventory`, `tls_audit`, `http_probe`, `jarm`, `dnssec`, `oembed`. **Banned as new methods:** bare `extract` (grandfathered: `evidence.extract.ai` only; no new `extract.*` siblings) and noun content methods `social_meta`, `trackers`, `cdx`, `metadata`; use `web.page.enrich`, `archive.wayback.lookup`, `evidence.file.analyze`.

**Authoring picker:** raw bytes → fetch / mirror / crawl; one index answer → lookup (or reverse); many subjects from one seed → enumerate; patterns on held content → scan; target live infra → probe (+ invasive); deepen a subject → enrich; where-else → crossref; citable URL Evidence → capture; push to archive → submit; held file → draft → analyze.

## Public vs paid

**One Cap ≈ one source contract** (D4). Split when the paid product is identity-bearing or answers a different question (RDAP `network.whois.lookup` vs paid `network.whoisxml.lookup`). Never "DNS lookup with optional Shodan", and do not bury a second source as silent failover. Free, keyed-free and paid Caps are told apart in each Cap's `credentials` and derived egress classes in `capabilities.gen.json`. Paid corpus Caps follow D5.

## Contacts and egress classes

A Cap declares who it talks to in `contacts`, the one network statement it makes (`contact` in `@watchdog/caps/sdk`; the list is `[]` for a Cap that stays on the install). Its egress classes derive from that list; a Cap states no `egress`.

| Contact | Meaning | Class |
| --- | --- | --- |
| `contact.provider(host)` | A fixed host that receives Case data, anonymous. `redirects: "any_public"` when it answers by redirecting to hosts it cannot name (RDAP bootstrap) | `public_lookup` |
| `contact.provider(host, { keyed: true })` | The same, with the operator's key | `account_lookup` |
| `contact.download(url)` | A body-less GET of a fixed URL: nothing from the Case is part of the request (Tor exit list, FireHOL, Feodo, GreedyBear) | `public_lookup` |
| `contact.dnsZone(zone)` | DNS questions under a fixed zone: the name carries the seed to that zone's servers (Team Cymru) | `public_lookup` |
| `contact.target(via, { anyHost })` | The host the input names, over `http` (any public host on a redirect; `anyHost` for a Cap that makes one call per hop), `tls` or `dns` (the input's own name and names under it) | `target` |
| `contact.model()` | The configured AI model endpoint | `model` |

The system DNS resolver is infrastructure, not a Contact: a DNS Cap declares the zone its question is about (the input's own name is `target`, a fixed zone is `dnsZone`). A Cap that may send a key (an optional credential) declares the keyed Contact, so it needs `account_lookup` whether or not a key is set. `invasive` stays authored: it says the Cap is detectable by the target, which no Contact derives. `deriveEgressClasses` (`@watchdog/schemas/caps`) returns every class a Cap's Contacts put it in, in the order `local`, `target`, `public_lookup`, `account_lookup`, `model`; no Contact is `local`. Of the 65 Caps, 3 are `local`, 9 `target`, 25 `public_lookup`, 26 `account_lookup`, 1 `model`, and `network.url.enrich` is `target` and `public_lookup`.

A Case allows a set of classes (`cases.allowed_egress`, always including `local`; a new Case allows `local` and `target`). A Job whose Cap derives a class the Case does not allow is blocked where the switch was always enforced, the one availability check shared by `startJobEffect`, Playbook start and the worker's preflight: the Job is refused (`forbidden`) or failed (`egress_denied`) with a message that names the blocked classes and where the Cap would go (`formatEgressBlock`). Only an owner or admin signed in changes the set (`updateCaseEffect` checks the role; an API key is refused), and the web app offers them the button that allows the blocked classes beside the block. The availability check reads the declaration; the Job's `Egress` then holds each request to it: a request to a host the Cap did not declare, on any redirect hop, a DNS name outside its zones, or a download that is not a body-less GET of its fixed URL is refused and recorded as a failed call ([`caps-boundary`](caps-boundary.md#outbound-http)). A `target` Cap's first hop is scoped to the host the input names unless the Cap declares `anyHost`; its redirect hops admit any public host, behind the address guard.

Tests: every Cap has a declaration test (`packages/caps/src/__tests__/contacts-declaration.test.ts`, one case per Cap in `declaration/`): it runs the Cap against fixtures under a recording `Egress` with refusal on (`createRecordedRun({ policy })`, as a Job builds it) and fails on a refused call, on a host, DNS name or TLS peer its Contacts do not admit (`undeclaredHosts`), and on a Contact no run used (`unusedContacts`). `cap-egress-classes.test.ts` pins the derived classes of every Cap, so a change of where a seed can go is a reviewed diff.

## Breach Caps are opt-in

Caps in the `breach` category (`breach.dehashed.lookup`, `breach.hibp.lookup`, `breach.hudsonrock.lookup`, `breach.leakradar.lookup`, `breach.snusbase.lookup`, and any later `breach.*`) query breach and leak corpora about people. They are **off until an operator sets `WD_BREACH_CAPS=safe` or `WD_BREACH_CAPS=full`** ([`configuration`](configuration.md)); the default is `off`. Enabling them makes the operator responsible for a lawful basis for the lookups and for each provider's terms ([`cap-register`](cap-register.md)). A breach Cap is identified by one predicate, `isBreachCap` (`@watchdog/caps`: the id's first segment is `breach`); the descriptor carries it as the derived flag `breach`, so a new Cap under `breach/` is gated with no second declaration.

While the setting is off, every path that could run one refuses it, in `@watchdog/core`: availability reports `breach_disabled` (before credentials and egress); `startJobEffect` refuses to queue it (`forbidden`, no Job row); the worker's preflight ends an already-queued Job `failed` with stop cause `preflight_failed` and the same message, without claiming it, so a Job queued before the operator turned the setting off, or inserted by hand, still never runs; `runPlaybookEffect` refuses a Playbook with a breach step (`email-breach`, `email-corpus`) before it writes a run, because a Playbook's `requires.flags` aggregates its steps' flags. The setting is read at call time, so a restart of web and worker applies it. `capabilities.list` and `capabilities.listPlaybooks` mark such entries `disabledReason: "breach_disabled"`, and `credentials.list` marks the slots only breach Caps read (`breachDisabled`): the web app shows them disabled with what enabling means and a link here. Turning the setting back on needs no data change; a Job that failed while it was off is retried like any failed Job.

### Breach credentials by mode

`WD_BREACH_CAPS` is one instance-level setting with three values; an unparsable value is rejected at startup (and counts as `off` where the environment is not validated, such as unit tests).

| Mode | Caps | DeHashed and Snusbase Evidence | Case Export |
| --- | --- | --- | --- |
| `off` (default) | unavailable, shown disabled | none | not applicable |
| `safe` | available | no plaintext password and no password hash, ever | no credentials; the credential opt-in is refused (`InvalidError`, "only while `WD_BREACH_CAPS=full`") |
| `full` | available | plaintext and hashes as the provider returned them | credential fields cut to the safe attributes unless an owner or admin includes breach credentials for that Export |

Raw provider response bodies are fingerprint-only (hash and size) in every mode (`capBodyPolicy`), and never exported.

**What `safe` keeps.** For each credential field of a record: `present` (boolean), `kind` (`plaintext`, or the hash type from its format: `bcrypt`, `argon2`, `md5`, `sha1`, `sha256`, `sha512`, else `unknown`; detection is conservative, and a 32-character hex hash reads as `md5` though an NTLM hash looks the same), `length` (of the plaintext, or of the hash string) and a keyed reuse `fingerprint`. Emails, usernames, breach names and dates are kept as in `full`. A snapshot's `reuse` lists values shared by two or more records of the result, and the report says so ("3 records share a password (fingerprint ab12cd34…)").

**The fingerprint** is HMAC-SHA256 of the exact value under a key HKDF-derived from the existing master secret (`WD_MASTER_VAULT_KEY`) with the fixed label `watchdog/breach-credential-reuse/v1`; no new secret. It matches the same password across records, Jobs and Cases on one instance, and cannot be matched on another instance. The limit: it is an HMAC keyed by the instance secret. It is not reversible without that key, but whoever holds the key can test password guesses against a fingerprint. That is why the key is derived from the vault master key and never leaves core: it is not in any Cap, Evidence file, log or Export. A plaintext and a hash are fingerprinted as separate values (the role is part of the message), so the same password hashed by two providers does not match. Rotating `WD_MASTER_VAULT_KEY` (`just vault-rekey`) changes every fingerprint. The key never enters `packages/caps` or `packages/tools`: core hands a Cap `ctx.credentialFingerprint(value, role)` and `ctx.breachCredentialMode` (`jobs/stages/collect.ts`), and the shared transform (`packages/tools/src/breach/credentials.ts`) takes the function, never the key.

**Export in `full` mode.** The Export writer recognises breach Evidence by its origin: the Job that produced it (`job_evidence`) and that Job's Cap (`export/breach-evidence.ts`), parses it with that Cap's snapshot schema and rewrites the credential fields through the same transform `safe` mode uses (`redactBreachArtifact`, `@watchdog/caps`). The producers are read again for every page of Evidence, so a breach Job that commits during a long export is covered. A breach file that does not parse, or is over 8 MiB (the limit applies to breach files only), is withheld (fail closed) and listed in `VERIFY.md` with a fixed reason. Evidence a Job produced whose Job cannot be read back is withheld too (`producer_unknown`). Evidence no Job produced (uploads, attestations, pastes) is exported as it is, whatever its size or shape: it is not breach output, and the Export does not inspect it. The credentials in the redacted file's `reuse` list are recomputed from its entries under the current key. `?breachCredentials=1` (`includeBreachCredentials` for the export Job) keeps the stored credentials: owners and admins only (a member or an API key gets `forbidden`, like `?rawBodies=1`), refused with `InvalidError` unless the instance runs `full`, and an open export is joined only by a request with the same options. The download of an archive built with credentials (`GET /cases/{id}/exports/{jobId}`) is held to the same caller check: a member or an API key gets `forbidden`. Redaction depends on the file, not the current mode, so Evidence stored while the instance ran `full` is still redacted after a switch to `safe`.

**Result cache.** A breach Cap's `jobs.cap_version` is its code fingerprint plus the mode (`<fingerprint>+safe`, `stampedCapVersion`), stamped at claim. The result cache is keyed by that version, so a `full` result is never served to a `safe` Job or the reverse, and the run takes its credential mode from the same stamp.

**Watchdog never uses a retrieved credential to log in to anything, and no feature may.** Using a recovered password or hash to access an account is unauthorised access under the UK Computer Misuse Act 1990 s.1 and the US Computer Fraud and Abuse Act, whatever the mode and whoever asks. Credentials are evidence that a record exists in a dump; nothing in Watchdog tests, replays or submits them.

Follow-ups: reveal a stored credential with an audit log (#539), and a retention limit for stored credentials (#540).

## Derived metadata

A Cap states each fact once. `needs_key` is derived from `credentials` (a Cap whose credentials are all optional does not need a key), `third_party` and the egress classes from `contacts`, `breach` from the `breach.` id category, and `reportLabel` (the name in a bad-report error) defaults to the id. `flags` carries only `slow` and `invasive`. The HTTP user agent is `watchdogUserAgent(id)`: `defineCollectCap` hands it to `fetch(ctx, { userAgent })`, so a Cap never spells one (`Watchdog/1.0 (+<id>; OSINT)`).

## Providers and the register

Every Cap has a required `provider` block (`CapProvider`, `packages/caps/src/sdk/provider.ts`): `name`, `url`, `termsUrl`, `tier` (`free`, `freemium`, `paid`, `self`), `commercialUse` (`allowed`, `restricted`, `forbidden`, `unknown`) and an optional `attribution` (`{ text, url }`). Caps that share a provider share one constant in `packages/caps/src/providers/`.

- `termsUrl` is the page that governs API or data use, read from the provider itself. `commercialUse` is the verdict for the plan the Cap needs: `allowed` only where the provider's text says so, `restricted` where a paid plan, a licence or conditions are needed, `forbidden` where the terms prohibit it. **Where the terms are silent, ambiguous, behind a login or unreachable, the value is `unknown`: never a guess.** A short comment above each provider constant says why.
- A Cap that calls no third party is `tier: "self"` and `commercialUse: "allowed"` (`defineProvider` enforces the pairing). A provider can differ per plan or per endpoint (Team Cymru, urlscan.io, the oEmbed vendors): the constant records the most restrictive verdict and its comment says so.
- `name` is what a card shows: the provider as people say it (`CIRCL`, `crt.sh`, `This server`), with no parenthetical gloss or URL. Licence wording belongs in `attribution`.
- `attribution` is set only where the terms require credit. The web app shows it with the Cap's Job output (the Output tab of Job detail).
- **Redistribution verdicts attach to the contact host, not the Cap.** `HOST_REDISTRIBUTION` (`packages/caps/src/redistribution.ts`) holds one reviewed verdict per fixed host a Cap declares (a `provider` host, a `download` URL's host, a `dns` zone): `allowed` only where the provider's text lets the Export hand its raw responses on, `forbidden` where it bars that, `unknown` otherwise. Only `allowed` releases a body to the Export ([`export`](jobs-orpc.md#system-jobs-and-case-export)); `unknown` withholds like `forbidden`. A new host with no entry fails `redistribution.test.ts`. The credit line a host's data needs is the `attribution` of the provider block of the Caps that name it.
- [`cap-register.md`](cap-register.md) is generated from these blocks by `pnpm generate:caps`, one table per category. This page and the register state no Cap counts.

**Cut / defer (not Caps):** Spamhaus free DBL; Talos scrape; CheckPhish-as-Collect; CIRCL PDNS/PSSL until partner access; SecurityTrails / DNSDB / RiskIQ / RecordedFuture; scanner clones (ONYPHE / ZoomEye / Netlas / BinaryEdge); Maigret-class → tools hub; GreedyBear enrichment until a Honeynet token grant.

## Ship gates

A Cap stays **unnumbered backlog** until all are filled:

| Gate | Example |
| --- | --- |
| Interpret target | `ip` / `domain` Identifiers + summary Claim, or Claim-only / none |
| Named source | crt.sh, system resolver, … |
| Credential | none / `SHODAN_API_KEY` / … |
| Passive/active | useCases + invasive flag |
| Contacts | `contact.provider("crt.sh")` · `contact.target("dns")` · `[]`; the egress classes derive |
| Provider | the `provider` block, with terms read from the provider (`unknown` when unclear) |

Catalog growth is gated by this table, not by a size ceiling.

**DNS / WHOIS interpret:** DNS A/AAAA → `ip` Identifiers; NS/MX stay in the Claim. Shared `interpretWhoisSnapshot`: observation Claim (NS in prose) + optional Event when `expiresAt` is in the past or within 90 days. Cached reports may omit dates (`.nullish()`); invalid WHOIS dates parse to `null`.

## Playbooks

Curated linear recipes (`packages/caps/src/playbooks/definitions.ts`). Caps stay individually runnable from Jobs. `planPlaybook` validates the whole recipe and emits step 0 only; later Jobs are created when the step before them has settled and the steps it reads succeeded.

- **Seeds:** `host` · `url` · `evidence` · `ip` · `email` · `hash` · `handle`. Email/handle map to Cap IO `identifier`. Caps whose Zod field is `query` receive it from the primary seed (email → handle → ip → url → host). A url seed also derives `host`.
- **Bind (enqueue time):** next-step input is filled from the playbook seed, the Evidence linked to the predecessor Job (`job_evidence`), or predecessor `jobs.pivots` (Caps may declare `pivots(report)`; persisted on success, including cache hits). Do not bind from Triage Proposals.
- **Fan-out:** a step may explode into N Jobs (`playbookFanIndex` 0..n-1, default cap 25). An empty list completes the step with no Jobs; it does not end the run. The next step is created only when all siblings at the current step are terminal; one sibling failure does not cancel the others, and a step counts as succeeded when any sibling did.
- **Dependencies (#354):** a step depends on step N when a `bind` or `fanOut` reads N's output (`playbookStepDependencies`, transitive); a plain step, or one bound only to the seed, depends on nothing. Steps still run one at a time, in order, but a failure never abandons the run: a step whose dependency failed, was cancelled or was skipped is **skipped**, and the next step is considered. A bind or fan-out that cannot be built counts as that step failing. Skipped is derived (no Job, and a dependency ended without success), never stored, and the view names the step that held it back as `blockedBy` (the root failed step; a bind or fan-out error keeps a plain `reason`). `playbookStepViews` gives the per-step `pending | running | succeeded | failed | skipped` view from the recipe and the run's Jobs. A run is `cancelled` only when a user cancels it.
- **Outcome:** when no step can run the run is `finished` with `outcome` `succeeded` (every step succeeded), `failed` (none did) or `partial`. Retrying a Job of a run creates the new Job in the same run, step and fan index and reopens the run (`running`, outcome cleared); when it succeeds the skipped dependents run and the outcome is recomputed. A cancelled run is not reopened: its retry is a standalone Job.
- **Reading a run (#354):** `GET /cases/{caseId}/playbook-runs/{playbookRunId}` (`jobs.getPlaybookRun`, scope `cases:read`, `getPlaybookRunForCaseEffect`) returns the run's `status` and `outcome` plus `playbookStepViews` per recipe step (`state`, the `blockedBy` step of a skipped one, the `reason` of a bind or fan-out error, and the step's `jobIds` oldest first), derived on read, so a skipped step (which has no Job) is listed too. A run of another Case or organization is `not_found`. Collect shows it in the Playbook spine and on the queue row (a `Partial` or `Failed` chip); `wd jobs get` (for a step Job) and `wd jobs playbook-run` print it. The step state words are `PLAYBOOK_STEP_STATE_LABELS` and the outcome words `PLAYBOOK_RUN_OUTCOME_LABELS` (`@watchdog/schemas/shared`).
- **Out of default books:** `archive.url.submit` and `network.urlscan.submit` (act / public records); harvest + `evidence.extract.ai` in one recipe; CDX auto-fetch of snapshots (`archive.page.history`, up to 25 fetches, is run on its own from Jobs); threat mega-piles (run keyed Caps from Jobs). Public identity/hash/URL reputation books stay keyless; keyed siblings carry a `-plus` suffix.

## See also

- Cap SPI and Jobs path: [`caps-boundary.md`](caps-boundary.md), [`jobs-orpc.md`](jobs-orpc.md)
- Identifier vocabulary: [`types.md`](types.md)
- Cap package layout: [`packages/caps/AGENTS.md`](../../../packages/caps/AGENTS.md)
- Product refuse list: [`../../explanation/product.md`](../../explanation/product.md)
