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

Entries are line-oriented: this file is excluded from the formatter (.prettierignore) because
the formatter reflows each entry onto one line, which moves the Banned line off the start of a
line and silently empties the gate's term list.
-->

# Watchdog

Vocabulary for the Watchdog platform: a small-team OSINT tool that keeps one Case Graph of Claims and Evidence under human custody. Doctrine and narrative: [`docs/explanation/product.md`](docs/explanation/product.md). Where this file and another doc disagree on a noun, this file wins.

## Workspace

**Organization**:
A Better Auth organization that owns Cases, members and API keys; every request resolves an active one. Detail: [`contracts/README.md`](docs/reference/contracts/README.md).
_Avoid_: Team, tenant

**Case**:
One investigation inside an Organization; owns its Entities, Evidence, Jobs, Proposals and Tasks. Detail: [`product.md`](docs/explanation/product.md).
_Avoid_: Project, file

**Active Case**:
The Case a session works in, held in the `watchdog.active-case-id` cookie and never in the URL. Detail: [`web/data.md`](docs/reference/web/data.md).
_Avoid_: Current case, selected case

## Graph

**Case Graph**:
The Postgres-backed Entities, Edges, Identifiers, Claims, Events and Open Questions of one Case; the single source of truth, with Export as a projection; a Dossier edits it but is never the store. Detail: [`ingress.md`](docs/reference/contracts/ingress.md).
_Avoid_: Graph DB, knowledge base

**Entity**:
A person, infra or org node in the Case Graph. Detail: [`types.md`](docs/reference/platform/types.md).
_Avoid_: Subject, target

**Edge**:
A directed, predicate-labelled relationship between two Entities, stored as one row; inverse labels are display only. The UI calls them Connections. Detail: [`types.md`](docs/reference/platform/types.md).
_Avoid_: Link, relationship

**Identifier**:
A normalized, validated handle, email, domain, IP or similar attached to an Entity; domains and IPs are Identifiers, not Entities. Detail: [`types.md`](docs/reference/platform/types.md).
_Avoid_: Selector

**Claim**:
A statement about an Entity with a class (observation, assessment, allegation, other), a custody tier and cited Evidence. Detail: [`types.md`](docs/reference/platform/types.md).
_Avoid_: Finding, fact, note

**Event**:
A dated happening on an Entity, with a free-text `when`, `what` and optional place. Detail: [`types.md`](docs/reference/platform/types.md).
_Avoid_: Timeline entry, incident

**Open Question**:
A tracked unknown on an Entity with status `open` or `resolved`; the skeptic's alternative to a first-class "contested" type. Detail: [`product.md`](docs/explanation/product.md).
_Avoid_: TODO, gap, hypothesis

**Retract**:
Withdraw a Claim as `retracted`, `contested` or `disproved` with a reason; there are no separate Contested or Disproved record types, and a Claim is retracted, never deleted. Detail: [`types.md`](docs/reference/platform/types.md).
_Avoid_: Delete

**Evidence**:
A content-addressed dump (file, URL archive, attestation) attached to a Case; every Claim and Proposal cites it. Detail: [`ingress.md`](docs/reference/contracts/ingress.md).
_Avoid_: Source, attachment

## Collection and decision

**Collect**:
Getting material in: dumping Evidence and running Cap Jobs, at `/collect`. Detail: [`caps-boundary.md`](docs/reference/platform/caps-boundary.md).
_Avoid_: ingest

**Intake**:
The dump, Enrich, Process path inside Collect; a code-level name (the web `intake` domain), never compounded into a type. Detail: [`caps-boundary.md`](docs/reference/platform/caps-boundary.md).
_Avoid_: Intake Process, Intake theater

**Cap**:
A deterministic, rerunnable, reviewable unit of collection or interpretation that emits Evidence and a Proposal, never Graph writes. Detail: [`caps-lexicon.md`](docs/reference/platform/caps-lexicon.md).
_Avoid_: Plugin, module, integration

**Job**:
One run of a Cap against a seed, with status queued, running, blocked, succeeded, failed or cancelled; not a Task. Detail: [`jobs-orpc.md`](docs/reference/platform/jobs-orpc.md).
_Avoid_: Task, process

**Playbook**:
A curated linear recipe of at least two Caps whose Jobs are created step by step. Detail: [`caps-lexicon.md`](docs/reference/platform/caps-lexicon.md).
_Avoid_: Workflow, pipeline, canvas

**Proposal**:
A pending patch of Graph operations produced by a Cap's `interpret` or by an agent; it changes nothing until Triage Accept. Detail: [`ingress.md`](docs/reference/contracts/ingress.md).
_Avoid_: Candidate, suggestion, draft

**Triage**:
The surface and gate where a human reviews Proposals, at `/triage`. Detail: [`ingress.md`](docs/reference/contracts/ingress.md).
_Avoid_: Review queue

**Accept**:
The human act in Triage that applies a Proposal to the Case Graph and sets its custody tier; the trust boundary. Detail: [`custody.md`](docs/reference/contracts/custody.md).
_Avoid_: Approve, merge, commit

**graph write**:
The explicit agent escape hatch (`wd graph write`, `userOverride`) that writes the Case Graph at `unverified` with a `graph_writes` audit row. Detail: [`agent-ingress.md`](docs/reference/contracts/agent-ingress.md).
_Avoid_: Direct write, silent write

**Dossier**:
The human edit surface for one Entity's Graph records, written directly rather than through a Proposal; never the source of truth for the Case Graph. Detail: [`ingress.md`](docs/reference/contracts/ingress.md).
_Avoid_: Profile, wiki page

**Export**:
The regenerable markdown projection of a Case Graph; never a second source of truth. Detail: [`caps-boundary.md`](docs/reference/platform/caps-boundary.md).
_Avoid_: Backup, master

**Task**:
A kanban work item on a Case (backlog, in_progress, blocked, done, dropped); not a Graph write and not a Job. Detail: [`domains.md`](docs/reference/web/domains.md).
_Avoid_: Job, ticket, to-do

## Custody tiers

**unverified**:
The tier of anything a Cap, agent or graph write lands; the only tier machines may set. Detail: [`custody.md`](docs/reference/contracts/custody.md).
_Avoid_: Draft, raw, unconfirmed

**possible**:
The intermediate tier a human sets in Triage or the Dossier when evidence supports but does not settle a Claim; there is no probable tier. Detail: [`custody.md`](docs/reference/contracts/custody.md).
_Avoid_: Probable, likely, percent confidence

**confirmed**:
The top tier; only human Accept or the Dossier with evidence gates may set it, never a Cap or agent. Detail: [`custody.md`](docs/reference/contracts/custody.md).
_Avoid_: Verified, proven, true

## Retired vocabulary

Retired v2 terms. Never use them for current design; use the replacement. Detail: [`product.md`](docs/explanation/product.md).

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
_Use_: Ingress path in [`ingress.md`](docs/reference/contracts/ingress.md)

**Mutation tiers**:
v2 R-tier ladder for graph mutations; custody tiers replaced it.
_Banned_: Mutation tiers, Mutation R-tiers
_Use_: unverified, possible, confirmed
