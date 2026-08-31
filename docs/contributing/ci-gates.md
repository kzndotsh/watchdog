# CI and local gates

**What this is:** lefthook, CI jobs, regen commands (`generate:caps`, `generate:client`), stop-gate / doc-affect.  
**What this is not:** test methodology ([`testing/standards.md`](testing/standards.md)).

## Gotchas

- **Stop hook**: `.cursor/hooks/stop-gate.mjs` lint-checks changed files, runs `ds:ban` when web UI paths are dirty, `check-agents.mjs --strict` when `AGENTS.md` is dirty, and `validate-agents.mjs` when `.agents/skills/**` or `.cursor/README.md` are dirty; fix violations before ending the turn. `wd-ui-files.mjs` is bidirectional with `shared/ui` except `shadcn/` and `__tests__/`.
- **Plans are not SoT**: durable contracts live in `docs/` (incl. `docs/reference/web/`). `.cursor/plans/` (incl. `_archived/`) are historical; don't reintroduce Tape/Console/Inspector/Workbench nouns from old plans.
- **Duplicate React imports**: strReplace can create duplicate `import { useState } from "react"`: check the first lines after edits.
