<!--
Format: .agents/skills/domain-modeling/GLOSSARY-FORMAT.md, which defines only the term entry
(**Term**, a one-line definition) and the Avoid line. This file extends it with:
  - `Detail:` link at the end of a definition, pointing at the doc that owns the term.
  - Use line  (underscore-wrapped "Use" then a colon): the replacement for a retired term.
  - Banned line (underscore-wrapped "Banned" then a colon): comma-separated retired phrases.
    `pnpm check:agents:strict` reads these from scripts/check-agents.mjs and fails any
    AGENTS.md line containing one (exact case, whitespace-flexible, whole words). Allowlist a
    deliberate mention with the comment check:agents allow-banned (HTML comment form); text
    after a `## Revision` heading is skipped. Banned lines inside code fences are ignored.
    The gate requires this file and at least one Banned line. Retiring a word is one edit here.
  - Avoid line: soft synonyms and the preferred term. Guidance only. Keep each Avoid list to
    plain terms (no parentheticals) and put any nuance in the definition.

Entries are line-oriented: this file is excluded from the formatter (`oxfmt.config.ts` ignore list) because
the formatter reflows each entry onto one line, which moves the Banned line off the start of a
line and silently empties the gate's term list.
-->

# Watchdog

Vocabulary for the Watchdog platform: a small-team OSINT tool that keeps one Case Graph of Claims and Evidence under human custody. Doctrine and narrative: [`explanation/product.md`](explanation/product.md). Where this file and another doc disagree on a noun, this file wins.

## Workspace

**Organization**:
A Better Auth organization that owns Cases, members and API keys; every request resolves an active one. Detail: [`contracts/README.md`](reference/contracts/README.md).
_Avoid_: Team, tenant

**Case**:
One investigation inside an Organization; owns its Entities, Evidence, Jobs, Proposals and Tasks. Detail: [`product.md`](explanation/product.md).
_Avoid_: Project, file

**Deleted Case**:
A Case an owner or admin deleted: hidden from every surface at once, restorable for `WD_CASE_RETENTION_DAYS` days (default 30), then purged by the worker. A purge erases its content and files and leaves a short permanent deletion record. Detail: [`custody.md`](reference/contracts/custody.md#deletion-and-retention).
_Avoid_: Archived Case, trashed Case

**Active Case**:
The Case a screen works in: the Case in a Work URL (`/cases/$caseSlug/...`), else the last Case entered, held in the `watchdog.active-case-id` cookie. Detail: [`web/data.md`](reference/web/data.md).
_Avoid_: Current case, selected case

**API key**:
A credential for the API and `wd`, held by a signed-in user and limited to scopes: `cases:read`, `evidence:write`, `proposals:write`, `graph:write` (any write scope implies read). Accept, Reject, Case delete and restore, credential writes and a Case's allowed egress need a signed-in session, so a key is refused whatever its scopes. Job starts are rate limited per key. Detail: [`agent-ingress.md`](reference/contracts/agent-ingress.md#key-scopes).
_Avoid_: Token, service account

**Vault**:
The encrypted store of a user's Cap credentials (the slots in Settings, Credentials), sealed under `WD_MASTER_VAULT_KEY`; a Cap reads a slot only through `ctx.getCredential`, and the API lists slot names but never returns a secret. Losing the key makes stored credentials unreadable. Detail: [`caps-boundary.md`](reference/platform/caps-boundary.md#cap-credentials).
_Avoid_: Secrets store, keychain

**Job start limit**:
A cap on Job starts per fixed window, applied to an Organization and to each API key; a start over either is refused with 429 `job_start_limited` and queues nothing. A retry and a Playbook run each count as one start. Detail: [`job-start-limits.md`](how-to/job-start-limits.md).
_Avoid_: Rate limit, quota

## Graph

**Case Graph**:
The Postgres-backed Entities, Edges, Identifiers, Claims, Events and Open Questions of one Case; the single source of truth, with Export as a projection; a Dossier edits it but is never the store. Detail: [`ingress.md`](reference/contracts/ingress.md).
_Avoid_: Graph DB, knowledge base

**Entity**:
A person, infra or org node in the Case Graph. Detail: [`types.md`](reference/platform/types.md).
_Avoid_: Subject, target

**Edge**:
A directed, predicate-labelled relationship between two Entities, stored as one row; inverse labels are display only. The UI calls them Connections. Detail: [`types.md`](reference/platform/types.md).
_Avoid_: Link, relationship

**Identifier**:
A normalized, validated handle, email, domain, IP or similar attached to an Entity; domains and IPs are Identifiers, not Entities. Detail: [`types.md`](reference/platform/types.md).
_Avoid_: Selector

**Claim**:
A statement about an Entity with a class (observation, assessment, allegation, other), a custody tier and cited Evidence. Detail: [`types.md`](reference/platform/types.md).
_Avoid_: Finding, fact, note

**Event**:
A dated happening on an Entity, with a free-text `when`, `what` and optional place. Detail: [`types.md`](reference/platform/types.md).
_Avoid_: Timeline entry, incident

**Open Question**:
A tracked unknown on an Entity with status `open` or `resolved`; the skeptic's alternative to a first-class "contested" type. Detail: [`product.md`](explanation/product.md).
_Avoid_: TODO, gap, hypothesis

**Retract**:
Withdraw a Claim as `retracted`, `contested` or `disproved` with a reason; there are no separate Contested or Disproved record types, and a Claim is retracted, never deleted. Detail: [`types.md`](reference/platform/types.md).
_Avoid_: Delete

**Evidence**:
A content-addressed dump (file, URL archive, attestation) attached to a Case; every Claim and Proposal cites it. Detail: [`ingress.md`](reference/contracts/ingress.md).
_Avoid_: Source, attachment

**Hidden Evidence**:
Evidence a user hid: soft-deleted, kept in the Case and restorable, left out of default views, and its Jobs no longer show in Collect. Not a Retract (that is for Claims). Detail: [`domains.md`](reference/web/domains.md).
_Avoid_: Deleted Evidence, archived Evidence

## Collection and decision

**Collect**:
Getting material in: dumping Evidence and running Cap Jobs, at `/cases/$caseSlug/collect`. Detail: [`caps-boundary.md`](reference/platform/caps-boundary.md).
_Avoid_: ingest

**Intake**:
The dump, Enrich, Process path inside Collect; a code-level name (the web `intake` domain), never compounded into a type. Detail: [`caps-boundary.md`](reference/platform/caps-boundary.md).
_Avoid_: Intake Process, Intake theater

**Dump**:
The act, and the result, of adding raw material to a Case as Evidence: a paste, a file upload or a URL, before any Cap has read it. Detail: [`caps-boundary.md`](reference/platform/caps-boundary.md#intake).
_Avoid_: Import, upload

**Enrich**:
Overloaded; say which. The Intake verb starts `network.url.enrich` on a URL dump to fetch its page text. A Cap kind (`kind: enrich`) is a Job role that leaves Job-internal artifacts and usually no Proposal. A Cap id method `enrich` deepens an existing subject. Detail: [`caps-lexicon.md`](reference/platform/caps-lexicon.md#enrich-triple-do-not-conflate).

**Process**:
The Intake step that reads a dump's text with a Cap (`evidence.harvest`, deterministic, or `evidence.extract.ai`, model) and yields a Proposal when an Entity is attached. Not the word for running any Job. Detail: [`caps-boundary.md`](reference/platform/caps-boundary.md#intake).

**Collect queue**:
The list on the Collect screen: one row per Evidence item, Playbook run or lone Job, with one state (queued, running, unprocessed, landed, failed, cancelled, hidden). It is a projection the database keeps current, never written by the application. Detail: [`domains.md`](reference/web/domains.md).
_Avoid_: Job list, inbox

**Cap**:
A deterministic, rerunnable, reviewable unit of collection or interpretation that emits Evidence and a Proposal, never Graph writes. Its version is derived from the code it reaches, never written by hand, and keys the result cache. Detail: [`caps-lexicon.md`](reference/platform/caps-lexicon.md).
_Avoid_: Plugin, module, integration

**Cap kind**:
What a Cap does to the world: `collect` (reads and gathers Evidence), `enrich` (see Enrich), `process` (reads Evidence already in the Case) or `act` (an action with an outside effect, such as submitting a URL to an archive; an Action Cap has no cached results). Detail: [`caps-lexicon.md`](reference/platform/caps-lexicon.md#three-layers-never-collapse).
_Avoid_: Cap type

**Seed**:
The input a Cap or Playbook starts from: a host, URL, Evidence item, IP, email, hash or handle, checked against what the Cap consumes. A Playbook binds its seed, or an earlier step's outputs (the hosts, IPs, URLs, emails, hashes and handles that step's Job produced), into each step. Detail: [`caps-lexicon.md`](reference/platform/caps-lexicon.md#playbooks).

**Job**:
One run of a Cap against a seed, with status queued, running, succeeded, failed or cancelled; not a Task. Detail: [`jobs-orpc.md`](reference/platform/jobs-orpc.md).
_Avoid_: Task, process

**Lane**:
A group of Jobs the worker runs with its own number of slots (quick lookups, heavy processing, actions), so a slow Job does not hold up quick ones; a Cap's lane follows from its descriptor. Detail: [`jobs-orpc.md`](reference/platform/jobs-orpc.md).
_Avoid_: Queue, pool

**Playbook**:
A curated linear recipe of at least two Caps whose Jobs are created step by step. Detail: [`caps-lexicon.md`](reference/platform/caps-lexicon.md).
_Avoid_: Workflow, pipeline, canvas

**Playbook run**:
One start of a Playbook in a Case. Its steps are created one at a time; a step whose dependency failed or was cancelled is skipped, never stored. A finished run has an outcome of `succeeded`, `failed` or `partial`; retrying a step reopens the run. Detail: [`caps-lexicon.md`](reference/platform/caps-lexicon.md#playbooks).
_Avoid_: Workflow run, pipeline run

**Contact**:
Who a Cap talks to, declared once on the Cap: a provider (a fixed host that receives Case data, anonymous or with the operator's key), a download (a body-less GET of a fixed URL that carries no Case data), the target (the host the input names), a DNS zone, or the model endpoint. A Cap with no Contact stays on the install. The Cap's egress classes derive from its Contacts, and its declaration test fails on a host the Cap touched without declaring. Detail: [`caps-lexicon.md`](reference/platform/caps-lexicon.md#contacts-and-egress-classes).
_Avoid_: Destination, endpoint, allowlist

**Egress class**:
Where a Cap sends a Case's seed, derived from its Contacts: `local` (nothing leaves), `target` (the subject's own infrastructure sees a request), `public_lookup` (an anonymous public source or a fixed download), `account_lookup` (a vendor API under the operator's key) or `model` (an AI model endpoint). A Case allows a set of them (`allowed_egress`; new Cases allow `local` and `target`), and a Job whose Cap needs a class the Case does not allow is blocked until an owner or admin allows it. Detail: [`caps-lexicon.md`](reference/platform/caps-lexicon.md#contacts-and-egress-classes).
_Avoid_: Third-party egress, egress switch

**Provider call**:
One request a Job's Cap made to a Contact (an HTTP request with its redirect hops, a DNS question, a TLS handshake or a model call), recorded before it is sent, with its outcome and the hash of the response body. Evidence links to the calls behind it, and Evidence detail and Job detail list them, each with a download of a stored raw response as an attachment. Detail: [`caps-boundary.md`](reference/platform/caps-boundary.md#outbound-http).
_Avoid_: Request log, API log

**Breach Cap**:
A Cap in the `breach` category, which queries breach and leak corpora about people. All are off until the operator sets `WD_BREACH_CAPS` to `safe` (Evidence never holds a plaintext password or hash) or `full`; a breach hit shows a record exists in a dump, not that the person controls the account, and no feature may use a recovered credential. Detail: [`caps-lexicon.md`](reference/platform/caps-lexicon.md#breach-credentials-by-mode).
_Avoid_: Leak Cap, credential Cap

**Library**:
The organization-wide catalog of every Cap and Playbook, at `/library`: browse by category, start from the input you have, and see whether each entry is ready for you (ready, missing API key, off by the operator, or unavailable) and whether it sends data to a third party. It is not Case-scoped and runs nothing; running always goes through Collect in a Case. Detail: [`web/domains.md`](reference/web/domains.md).
_Avoid_: Marketplace, store, registry

**Proposal**:
A pending patch of Graph operations produced by a Cap's `interpret` or by an agent; it changes nothing until Triage Accept. Detail: [`ingress.md`](reference/contracts/ingress.md).
_Avoid_: Candidate, suggestion, draft

**Triage**:
The surface and gate where a human reviews Proposals, at `/cases/$caseSlug/triage`. Detail: [`ingress.md`](reference/contracts/ingress.md).
_Avoid_: Review queue

**Reject**:
The human act in Triage that closes a Proposal without applying it. The Proposal's findings are fingerprinted so a later Job does not propose them again (finding suppression). Like Accept, it needs a signed-in session. Detail: [`custody.md`](reference/contracts/custody.md).
_Avoid_: Dismiss, decline

**Accept**:
The human act in Triage that applies a Proposal to the Case Graph and sets its custody tier; the trust boundary. Detail: [`custody.md`](reference/contracts/custody.md).
_Avoid_: Approve, merge, commit

**graph write**:
The explicit agent escape hatch (`wd graph write`, `userOverride`) that writes the Case Graph at `unverified` with a `graph_writes` audit row. Detail: [`agent-ingress.md`](reference/contracts/agent-ingress.md).
_Avoid_: Direct write, silent write

**Dossier**:
The human edit surface for one Entity's Graph records, written directly rather than through a Proposal; never the source of truth for the Case Graph. Detail: [`ingress.md`](reference/contracts/ingress.md).
_Avoid_: Profile, wiki page

**Export**:
Turning data from Postgres into static files the user holds outside the app: a snapshot that goes stale as soon as the Case changes, and never a second source of truth. The usual one is the Case Export; the regenerable markdown projection of a Case Graph and an Entity's `export.md` are Exports too. Detail: [`caps-boundary.md`](reference/platform/caps-boundary.md).
_Avoid_: Backup, master, sync

**Case Export**:
A zip of one Case (`export.zip`, `wd export zip`) built from the Case Graph: Evidence files, `provider-calls.jsonl`, `ATTRIBUTION.md` and `VERIFY.md`. A large Case builds as a system Job and the download link expires. Raw provider responses and breach credentials are left out unless an owner or admin opts in for that Export, and only where the host's terms allow. Detail: [`jobs-orpc.md`](reference/platform/jobs-orpc.md#system-jobs-and-case-export).
_Avoid_: Backup

**Open in**:
Opening an Entity's export in an outside tool (today Claude or ChatGPT) from the Dossier. An Organization can turn it off; each use is logged as Activity. Nothing comes back into the Case.
_Avoid_: Handoff, AI handoff

**Task**:
A kanban work item on a Case (backlog, in_progress, blocked, done, dropped); not a Graph write and not a Job. Detail: [`domains.md`](reference/web/domains.md).
_Avoid_: Job, ticket, to-do

**Declared list**:
A list screen or read whose filters, sorts and search are declared once in `@watchdog/schemas` (`defineList`), so the API, SQL, URL, CLI and toolbar share one canonical query. Search needs at least `SEARCH_MIN_QUERY_LENGTH` (2) characters; the first page carries a capped total. Detail: [`ADR-0007`](adr/0007-list-standard.md).
_Avoid_: Table, grid

**Activity**:
The append-only log of what changed on a Case: one entry per domain change (a subject noun, a verb, who, a short label), written in the same transaction as the change. It is the one source of Recent activity and of the live-update signal, pruned after 90 days; it is not the Graph audit (`graph_writes` is) and holds no Evidence bodies or patches. Detail: [`ADR-0005`](adr/0005-unified-activity-log.md).
_Avoid_: Changes, audit log, event stream

## Custody tiers

**unverified**:
The tier of anything a Cap, agent or graph write lands; the only tier machines may set. Detail: [`custody.md`](reference/contracts/custody.md).
_Avoid_: Draft, raw, unconfirmed

**possible**:
The intermediate tier a human sets in Triage or the Dossier when evidence supports but does not settle a Claim; there is no probable tier. Detail: [`custody.md`](reference/contracts/custody.md).
_Avoid_: Probable, likely, percent confidence

**confirmed**:
The top tier; only human Accept or the Dossier with evidence gates may set it, never a Cap or agent. Detail: [`custody.md`](reference/contracts/custody.md).
_Avoid_: Verified, proven, true

## Retired vocabulary

Retired v2 terms. Never use them for current design; use the replacement. Detail: [`product.md`](explanation/product.md).

**Scratch**:
v2 staging area before the Graph; Evidence plus Proposal replaced it.
_Banned_: Scratch
_Use_: Evidence, Proposal

**Candidate theater**:
v2 pre-Graph "candidate" records and intake ceremony; Proposal is the only pending-change noun.
_Banned_: Candidate theater
_Use_: Proposal

**wd promote**:
v2 CLI command for moving staged material into the Graph; Triage Accept (or `wd graph write` with override) replaced it. The verb "promote" is avoided for the same act but not banned, since it has ordinary meanings.
_Avoid_: promote
_Banned_: wd promote
_Use_: Accept, graph write

**Door A / Door B**:
v2 two-door write model; one ingress path replaced it (Collect, Evidence, Proposal, Triage Accept, Graph).
_Banned_: Door A, Door B
_Use_: Ingress path in [`ingress.md`](reference/contracts/ingress.md)

**Mutation tiers**:
v2 R-tier ladder for graph mutations; custody tiers replaced it.
_Banned_: Mutation tiers, Mutation R-tiers
_Use_: unverified, possible, confirmed
