# `.cursor/`

`.cursor/` is an **allowlist, not a blanket ignore** ([`.gitignore`](../.gitignore)). Only what's listed below is tracked; everything else under `.cursor/` (`rules/`, `skills/`, `agents/`, `plans/`, `settings.json`) is local-only — third-party tool installs, personal settings, or historical planning docs, none of it portable or meant for a public repo.

## Tracked here

| Path | What | Why it's here and not `.agents/` |
| --- | --- | --- |
| [`hooks/`](hooks/) | `secrets-guard.sh`, `stop-gate.mjs`, `validate-on-edit.mjs`, `run-node.sh` | Cursor-specific hook runtime; no portable hook spec exists |
| [`hooks.json`](hooks.json) | Hook registration (events, timeouts, `failClosed`) | Same — Cursor-only config format |
| `README.md` | This file | — |

Portable agent-facing content lives outside `.cursor/`: `AGENTS.md` (root + nested) and [`.agents/skills/`](../.agents/skills/) (`SKILL.md`, spec: [agentskills.io](https://agentskills.io)). Those are read by Cursor, Claude Code, and Codex alike. `.cursor/` holds only what genuinely cannot be portable — hook execution.

## Hooks

| Event | Script | Fails closed? | Does |
| --- | --- | --- | --- |
| `beforeReadFile` | [`secrets-guard.sh`](hooks/secrets-guard.sh) | **Yes** | Denies reads of `.env*`, `*.pem`/`*.key`, SSH keys, `credentials.json` before the model sees them. Pure POSIX `sh` — needs no `node`. |
| `afterFileEdit` | [`validate-on-edit.mjs`](hooks/validate-on-edit.mjs) via [`run-node.sh`](hooks/run-node.sh) | No | Re-runs `check-agents.mjs --strict` on `AGENTS.md` edits, `check:docs` on `docs/**` edits, or `validate-agents.mjs` on edits under [`.agents/skills/`](../.agents/skills/) or this file. Failures print to stderr only — the `stop` hook is what surfaces findings to the agent. |
| `stop` | [`stop-gate.mjs`](hooks/stop-gate.mjs) via [`run-node.sh`](hooks/run-node.sh) | No | Scoped to files changed this turn: lints them (`oxlint`, filtered from a repo-wide run — type-aware mode needs the whole project graph), runs `ds:ban` if web UI paths are dirty, runs agent-skills / `AGENTS.md` / **docs** validators when those paths are dirty, and **warns** on doc-affect misses (`check-docs-affected --warn`). `loop_limit: 2` — surfaces a finding at most twice per turn, then lets the agent stop rather than looping forever on something it can't fix. |

Local git hooks ([`lefthook.yml`](../lefthook.yml)): pre-commit runs `check:docs` + `check:docs-affected:strict` (four high-signal rows); commit-msg records `docs:allow-affect — reason` escape hatch.
Both non-`failClosed` hooks always print valid JSON and exit `0`, even on their own internal error — a hook must never block the agent because *it* broke.

**Cursor spawns hooks with its own extension-host environment, not the project's nix devshell** — `node`/`pnpm` are absent from that `PATH` (verified live by probing the real hook environment). [`run-node.sh`](hooks/run-node.sh) tries `node` directly first — install it globally (e.g. `nix profile install nixpkgs#nodejs`) and this path is instant — then falls back to `direnv exec` to pick up the flake devshell's `node`. The flake's shellHook banner lands on stderr, so stdout stays clean JSON either way.

## Common pitfalls (`validate-agents.mjs` error strings → fix)

| Error | Fix |
| --- | --- |
| `name must match folder` | Rename the `SKILL.md` frontmatter `name` (or the folder) so they're identical |
| `description missing a trigger clause` | Add "Use when …" / "Triggers on …" / "Use for …" somewhere in `description` — not a workflow summary |
| `metadata.owner must be "watchdog"` | Every committed skill must declare `metadata.owner: watchdog` — this is what stops a vendored/third-party skill from slipping into a public repo |
| `metadata.sources path does not exist` | Fix the path, or drop the stale source |
| `orphan metadata key` | Remove any frontmatter key the validator doesn't read — no field without a consumer |
| `SKILL.md exceeds N lines` | Move detail into `references/`, one level deep, each with an explicit "load this when X" |
| `unsafe path` | `metadata.sources` / referenced paths must be repo-relative, no `..`, no absolute paths |
| Staleness warning | A declared source changed more recently than the skill — re-read it and confirm the skill still matches; warn-only, not a merge gate |

## Skill retirement

**Skills are deletable.** A skill that persists forever means the underlying platform gap never got fixed. If a skill exists only to work around a Cursor/Claude Code/Codex limitation, and that limitation goes away, delete the skill — that's the system working as intended, not something to mourn. Don't keep a skill "just in case"; `git log` is the archive.

## See also

[`AGENTS.md`](../AGENTS.md#agent-skills) · [`.agents/skills/`](../.agents/skills/) · [`scripts/validate-agents.mjs`](../scripts/validate-agents.mjs)
