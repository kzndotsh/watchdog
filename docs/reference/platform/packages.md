# Platform packages

**What this is:** monorepo package list and forbidden-import matrix.  
**Not:** Cap SPI / Intake tutorial ([`caps-boundary.md`](caps-boundary.md)), jobs/oRPC ([`jobs-orpc.md`](jobs-orpc.md)), web Start/Query ([`../web/architecture.md`](../web/architecture.md)).

`apps/*` + `packages/*`: `@watchdog/env` (T3 Env boot secrets), `@watchdog/db` (Drizzle + events), `@watchdog/schemas` / `@watchdog/policy` / `@watchdog/ai`, `@watchdog/cap-sdk` / `@watchdog/caps` / `@watchdog/tools`, `@watchdog/core`, `@watchdog/log` (evlog process logs), `@watchdog/api` (oRPC), `@watchdog/client`, `@watchdog/cli` (`wd`), `apps/worker` (pg-boss).

## Package import direction (forbidden imports)

| Package | May depend on | Must not import |
| --- | --- | --- |
| `@watchdog/env` | (nothing in-workspace) | db, caps, core, api, apps, schemas, … |
| `@watchdog/schemas` | (nothing in-workspace) | db, caps, core, api, apps, tools, cap-sdk, policy, env |
| `@watchdog/policy` | schemas | db, caps, core, api, apps, tools, cap-sdk, ai |
| `@watchdog/db` | schemas, **env** (runtime); drizzle-kit via dotenv — see [`packages/db/AGENTS.md`](../../../packages/db/AGENTS.md). Owns **schema + `repos`** (SQL only). | caps, core, api, apps |
| `@watchdog/ai` | schemas | db, caps, core |
| `@watchdog/cap-sdk` | schemas | db, caps, core, api, apps, tools |
| `@watchdog/tools` | schemas (only if needed; prefer zero) | db, caps, core, ai, cap-sdk, api, apps |
| `@watchdog/caps` | schemas, ai, **cap-sdk**, **tools** | **db**, core, api, apps |
| `@watchdog/core` | db (**repos only** — no `drizzle-orm`), caps, cap-sdk, schemas, **policy**, **env**, **log** | api, apps — layout: `jobs/` · `cases/` · `proposals/` · `graph/` · `tasks/` · `search/` · `activity/` · `evidence/` · `infra/`; worker imports `@watchdog/core/worker` |
| `@watchdog/log` | (nothing in-workspace; pin `evlog`) | apps, cli, client, core, api, db, caps, … |
| `@watchdog/api` | core (+ schemas), **caps** (catalog descriptors only), **log** (`ApiContext.log?`) | apps, **db**, drizzle-orm |
| `@watchdog/client` | api (**types only** at import) + minified contract JSON | apps, db, caps, core, **log** |
| `@watchdog/cli` | client + env/cli + schemas | core, db, api, apps, **log** |
| `apps/*` | api / core / caps / schemas / **env** / **log** as needed | web must not import **db** except `auth/server.ts` + SSE `routes/api/events.ts` |

`PatchOp` and `patchOpSchema` live in **`@watchdog/schemas`** so Caps never depend on Drizzle. `EvidenceSnapshot` also lives in schemas (re-exported from `@watchdog/ai` for Process helpers). Accept / apply-patch custody (`assertPatchGates`, `patchNeedsConfidence`) lives in **`@watchdog/policy`** — pure, DB-free; import policy/schemas directly (do not re-export through core).

## See also

| Doc | Owns |
| --- | --- |
| [`jobs-orpc.md`](jobs-orpc.md) | Jobs path, oRPC, evlog |
| [`caps-boundary.md`](caps-boundary.md) | Caps SPI, credentials, Intake, Export |
| [`types.md`](types.md) | Schema / vocab ownership |
| [`caps-lexicon.md`](caps-lexicon.md) | Cap id/title/kind, D1–D5 |
