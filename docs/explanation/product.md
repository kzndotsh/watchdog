---
document_created: 2026-07-27T23:28
document_updated: 2026-09-05T13:40
---

# PRODUCT: intent and doctrine

**What this is:** why Watchdog exists, who it serves, what we refuse, and how we decide. Shared by web, CLI, Caps, and agents.  
**What this is not:** phase checkboxes ([`ROADMAP.md`](../../ROADMAP.md)) or route chrome ([`UX.md`](ux.md)).

---

## Core loop (should-state)

Small-team OSINT: keep one **Case Graph** of Claims + Evidence you can defend, while collection stays fast.

**Collect → Decide (Triage) → Graph under human custody → Export Case package.**

- Caps never write Graph (Proposal → Triage Accept). Agents default to Proposal; escape hatch is explicit `graph write` @ `unverified` with `graph_writes` audit. Humans may also write via Dossier.
- Postgres is SoT; markdown Export is a projection.
- If you need Scratch / Candidate / Mutation R-tiers to explain Day-0, the design failed.

**Team** maps to a Better Auth **organization**: one install org at bootstrap, org-scoped Cases, Settings → **Team** for invite + membership (`admin` / `member`). **Users** (instance admin only) is account disable/enable — not org membership. API and CLI calls resolve the active org from session or key owner; missing org context is **403**, not cross-org bleed. Case-child APIs that accept `caseId` treat a foreign-org Case as **`not_found`** (same as missing) — never return another org’s Graph.

---

## Past practice ≠ design

Field chats, vault habits, and frozen prototypes show **pain and anti-patterns**: not features to clone.

| Use history for | Do not use for |
| --- | --- |
| Personas, constraints, failure modes | "We did X → ship X" |
| Stress-testing whether the loop solves lived pain | Chat/git/Claude as product surfaces |
| Steal algorithms from `_legacy-*` when earned | Extending `_legacy-*` or resurrecting intake theater |

---

## How we got here (rewrite lessons)

| Era | What | Outcome |
| --- | --- | --- |
| Field improvisation | Signal + masters + Claude stitch + scrapes | Pain lab: not a product |
| v1 (`_legacy-v1`) | Vault SoT + fixed Python pipeline | Frozen: tradecraft tuition |
| v2 (`_legacy-v2`) | Broad platform spec; Cap/Mutation/Scratch theater | Frozen: breadth ≫ depth |
| v3 (greenfield) | Case + Evidence + Proposal + Triage + Export | **Live**: polish ≠ rewrite #4 |

**Lessons:**

1. Vibe / breadth prototypes are paid tuition: steal algorithms; do not extend frozen trees.
2. Spec ≠ product: Cap "done" means Evidence + Proposal out, not a registered stub.
3. Nouns earn their place from the loop: prefer precise words over soft synonyms.
4. Write-gate spirit stays; intake theater goes: untrusted → human via Evidence + Proposal.
5. Field improvisation confirms pain, not architecture.
6. Build principles (shape first, boundaries, levers, structure over prose) are doctrine: not a feature backlog.
7. Polish inside greenfield; a fourth rewrite is the failure mode to refuse.
8. Phase 0 honesty first: lying stubs and doc drift recreate "file exists ≠ works" at small scale.

The `_legacy-*` trees that record this history are untracked and live outside this repo.

---

## Personas (design for / don't productize)

| Persona | Design for | Don't productize |
| --- | --- | --- |
| **Builder** | Cap Jobs, CLI/API, Case Graph | Git-push as collab model; creds-in-chat onboarding |
| **Publisher-scraper** | Caps + Evidence + Export | Informal % confidence; mega-dossier as SoT |
| **Records / LE-adjacent** | Full web UI; async Case catch-up; referral when earned | Facial-search / bot chains as Day-0 |
| **Skeptic verifier** | Accept gates; Open Questions / Retract | Contested/Disproved as first-class types |
| **External collaborator** | Tiered share when earned | Pastebin / wormhole as product surfaces |

---

## Problems we solve (pain, not features)

1. AI / chat summaries treated as truth
2. Chat or git as system of record; dual "masters"
3. Async non-builder catch-up tax (Case must be readable without scrollback)
4. Weak identity merges (handle, mailbox, coincidence)
5. More collection → less clarity (progress paradox)
6. Unbounded AI loops without an Accept boundary
7. Long Job progress dumped into chat
8. Unshareable blobs; no scrubbed Export path when peers need partial trust

---

## Anti-patterns (refuse)

- Claude-as-author / AI stitch as dossier SoT
- Signal (or any chat) as case store
- Monolithic MASTER / dual personal masters
- Informal % confidence without evidence chain
- Handle existence or weak CMRA-style link = identity
- Machine-set `confirmed`
- Cap catalog theater (stubs presented as ready)
- Scratch / Candidate / promote / Door A/B
- Second hand-edited markdown SoT alongside Postgres
- Extending `_legacy-v1/` or `_legacy-v2/`
- Visual Playbook canvas / iPaaS
- Fourth platform rewrite to dodge Phase 0 honesty

---

## Design doctrine

1. **Field ≠ design**: pain and personas only; never habit-copy.
2. **Data shape + write-gate first**: protect option value; don't reopen earned nouns.
3. **Boundaries**: validate at OpenAPI / CLI / Cap / Evidence edges; Triage Accept is the trust boundary; Cap logic stays pure; shell stays thin.
4. **Caps are levers**: deterministic, rerunnable, reviewable; hand/AI stitch is not a lever.
5. **Encode in structure**: schema and Accept over prose warnings; strongest rung wins.
6. **Experience = core loop**: say no; ship less; no lying Caps; serve builder + non-tech + agent.
7. **Idempotent Jobs / Export / Accept**: converge on retry; content-address Evidence.
8. **Outcome over smooth middles**: phases verify end state; no legacy/Signal comfort shims.

---

## See also

| Doc | Owns |
| --- | --- |
| [`ROADMAP.md`](../../ROADMAP.md) | Phases, backlog, maturity |
| **This file** | Nouns, hard bets |
| [`UX.md`](ux.md) | IA, flows, experience debt |
| [`docs/reference/web/UI.md`](../../docs/reference/web/UI.md) | Design system / chrome |
| [`README.md`](../README.md) | Platform docs index |
