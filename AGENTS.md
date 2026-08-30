# AGENTS.md — Watchdog

Watchdog platform monorepo: Postgres + TypeScript under `apps/` · `packages/`. Investigation content (corpus, entity notes, vault vocabulary) lives in a separate private repo and never enters this one.

`_legacy-v2/` may be present locally but is untracked and frozen — do not extend or cite it.

On product nouns, **[`docs/PRODUCT.md`](docs/PRODUCT.md)** wins. On platform/UI contracts, **[`docs/`](docs/README.md)** + **[`apps/web/docs/`](apps/web/docs/README.md)** win.

## Quick reference

| Task | Command |
| --- | --- |
| Toolchain | `nix develop` |
| Postgres + MinIO | `just up` · `just minio-init` |
| Wipe case data | `just wipe` · `just wipe yes` (keeps auth+vault) |
| Install / migrate | `pnpm install` · `pnpm db:migrate` |
| Dev | `pnpm dev:web` · `pnpm dev:worker` |
| Lint / fix | `pnpm check` · `pnpm fix` |
| Git hooks | `lefthook install` (auto in `nix develop`) · `lefthook-local.yml` overrides · pre-commit: fix + agents + agent-skills · pre-push: typecheck + web DS |
| Typecheck / test | `pnpm typecheck` · `pnpm test` · `pnpm test:component` · `pnpm test:integration` · `pnpm test:e2e` · `pnpm test:e2e:smoke` |
| Web DS | `pnpm --filter @watchdog/web ds:check` |
| Caps / client regen | `pnpm generate:caps` · `pnpm generate:client` |
| AGENTS gate | `pnpm check:agents` · `pnpm check:agents:strict` |
| Skills gate | `pnpm validate:agents` |

Solo signup: `BETTER_AUTH_ALLOW_SIGNUP=1` → `/auth/sign-up` → set `0`. Package manager: **pnpm** only.

## Sub-AGENTS directory

**Read the relevant `AGENTS.md` before touching that tree — always, explicitly.** Nested `AGENTS.md` auto-attachment is version-sensitive and has an unresolved loading history; only this root file is verified always-loaded. Treat reading the nested file as a step in the task, not something the tool does for you: `apps/web`, `apps/worker`, `packages/{db,core,api,caps,cap-sdk,env,cli,client,policy,schemas,ai,tools,log,test-kit}`.

## Agent Skills

Portable workflows in [`.agents/skills/`](.agents/skills/) (root) and nested per-package (e.g. [`packages/caps/.agents/skills/`](packages/caps/.agents/skills/)) — readable by Cursor, Claude Code, and Codex. Load explicitly by name (`/audit-contract`, `/check-gates`, `/create-cap`); do not rely on auto-selection. `pnpm validate:agents` gates their structure and frontmatter in CI. See [`.cursor/README.md`](.cursor/README.md) for the full catalog and the retirement criterion.

## Where to Look

| Task | Primary path |
| --- | --- |
| Product / architecture / UX / types | `docs/` |
| UI / DS / domains / Query | `apps/web/docs/` |
| Product nouns / Cap loop | [`docs/PRODUCT.md`](docs/PRODUCT.md) |
| Caps / playbooks | [`docs/CAPS.md`](docs/CAPS.md) · [`packages/caps/AGENTS.md`](packages/caps/AGENTS.md) |
| Run the app | `README.md` |

## Boundaries (platform)

| Do | Don’t | Skill |
| --- | --- | --- |
| Postgres = Case Graph SoT; Export is a projection | Hand-edit Export as a second SoT | `audit-contract` |
| Collect → Evidence; Caps `interpret` → Proposal → Triage Accept | Caps/machines write Graph or set `confirmed` | `audit-contract` |
| Agents/CLI default: propose; graph write needs `userOverride` → Graph @ `unverified` + `graph_writes` | Silent machine Graph writes; mid-build verbs (<!-- check:agents allow-banned --> promote / Scratch / Door A / Candidate theater) | `audit-contract` |
| Secrets via vault / `ctx.getCredential` | Cap secrets in env or `Job.input` | — (hook: `secrets-guard`) |
| Chrome: Queue + Detail | Console / Tape / Panel / Pane / Rail / Strip | — |
| Process logs via `@watchdog/log` (evlog NDJSON) | Secrets/Evidence body in logs; treat evlog as Graph audit (`Job.logs` / `graph_writes` / Accept stay SoT) | — |
| Extend the tracked packages/apps | Extend `_legacy-*` | — |

**Ingress:** Collect→Evidence · Caps→artifacts+Proposal · Triage Accept→Graph · Dossier=human Graph edit.

## Investigation (compressed)

Never claim without evidence. Zero assumptions. Cite everything. Disclose uncertainty. Adversarial-test identity links.

Platform Accept tiers: **`unverified` / `possible` / `confirmed`**. Cap/agent output stays unverified until human Accept.

Breach data carries its own caveats: treat a hit as evidence that a record exists in a dump, not as proof the person controls the account. Adversarial-test every identity link before proposing it.

## External References

| Need          | File                                                 |
| ------------- | ---------------------------------------------------- |
| Platform docs | [`docs/README.md`](docs/README.md)                   |
| Web docs      | [`apps/web/docs/README.md`](apps/web/docs/README.md) |
| Roadmap       | [`ROADMAP.md`](ROADMAP.md)                           |
| Human README  | [`README.md`](README.md)                             |
