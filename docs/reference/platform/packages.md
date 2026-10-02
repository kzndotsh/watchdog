# Platform packages

**What this is:** monorepo package list and forbidden-import matrix.  
**Not:** Cap SPI / Intake tutorial ([`caps-boundary.md`](caps-boundary.md)), jobs/oRPC ([`jobs-orpc.md`](jobs-orpc.md)), web Start/Query ([`../web/architecture.md`](../web/architecture.md)).

`apps/*` + `packages/*`: `@watchdog/env` (T3 Env boot secrets), `@watchdog/db` (Drizzle + events), `@watchdog/schemas` / `@watchdog/policy` / `@watchdog/ai`, `@watchdog/caps` (catalog + Cap SPI at `@watchdog/caps/sdk`) / `@watchdog/tools`, `@watchdog/core`, `@watchdog/log` (evlog process logs), `@watchdog/auth` (Better Auth server: instance, invite signup, instance admin, actor resolution), `@watchdog/ui` (generated shadcn primitives), `@watchdog/test-kit` (dependency-free test helpers, dev only), `@watchdog/test-db` (Postgres harness + seeds, dev only), `@watchdog/api` (oRPC), `@watchdog/client` (generated OpenAPI / minified router + typed SDK), `apps/cli` (`@watchdog/cli` / `wd`), `apps/worker` (pg-boss), `apps/site` (`@watchdog/site` — static marketing; no `@watchdog/*` runtime deps).

## Package import direction (forbidden imports)

| Package | May depend on | Must not import |
| --- | --- | --- |
| `@watchdog/env` | (nothing in-workspace) | db, caps, core, api, apps, schemas, … |
| `@watchdog/schemas` | (nothing in-workspace) | db, caps, core, api, apps, tools, policy, env |
| `@watchdog/policy` | schemas | db, caps, core, api, apps, tools, ai |
| `@watchdog/db` | schemas, **env** (runtime); drizzle-kit via dotenv: see [`packages/db/AGENTS.md`](../../../packages/db/AGENTS.md). Owns **schema + `repos`** (SQL only). | caps, core, api, apps |
| `@watchdog/ai` | schemas | db, caps, core |
| `@watchdog/tools` | schemas (only if needed; prefer zero) | db, caps, core, ai, api, apps |
| `@watchdog/caps` (incl. SPI `@watchdog/caps/sdk`) | schemas, ai, **tools** | **db**, core, api, apps |
| `@watchdog/auth` | db, env, log, schemas; `better-auth` + nodemailer | api, core, caps, apps; `@tanstack/*` (apps pass framework plugins in) |
| `@watchdog/core` | db (**repos only**: no `drizzle-orm`), caps (+ `caps/sdk`), schemas, **policy**, **env**, **log**, **tools** | api, apps: layout: `jobs/` · `cases/` · `proposals/` · `graph/` · `tasks/` · `search/` · `activity/` · `evidence/` · `infra/`; worker imports `@watchdog/core/worker` |
| `@watchdog/ui` | (nothing in-workspace; shadcn primitives, generated and locked) | db, core, api, caps, apps |
| `@watchdog/test-kit` | (nothing in-workspace; dev only) | any `@watchdog/*` package; must not be imported from production code |
| `@watchdog/test-db` | db, schemas, test-kit (dev only) | caps, core, api, apps; must not be imported from production code |
| `@watchdog/log` | (nothing in-workspace; pin `evlog`) | apps, cli, client, core, api, db, caps, … |
| `@watchdog/api` | core (+ schemas), **log** (`ApiContext.log?`) | apps, **db**, drizzle-orm |
| `@watchdog/client` | (nothing in-workspace at runtime; generated JSON in `src/generated`, oRPC client libs; type entry `app-router` aliases live API `AppRouter` in-monorepo only) | api, apps, db, caps, core, **log** |
| `apps/cli` (`@watchdog/cli`) | client + schemas (+ own `WD_API_*`) | core, db, api, env, **log**, other apps |
| `apps/web` / `apps/worker` | api / **auth** (web) / core / caps / schemas / **env** / **log** / **ui** (web) as needed | web must not import **db** except SSE `routes/api/events.ts` (auth's db access is `@watchdog/auth`) |
| `apps/site` (`@watchdog/site`) | Astro + Tailwind only (tokens copied from web, not imported) | **db**, **core**, **api**, **caps**, `apps/web/src` |

`PatchOp` and `patchOpSchema` live in **`@watchdog/schemas`** so Caps never depend on Drizzle. `EvidenceSnapshot` also lives in schemas (re-exported from `@watchdog/ai` for Process helpers). Accept / apply-patch custody (`assertPatchGates`, `patchNeedsConfidence`) lives in **`@watchdog/policy`**: pure, DB-free; import policy/schemas directly (do not re-export through core). Client UI: `@watchdog/policy/patch-needs-confidence` — not the package barrel (Effect stays off the browser).

## See also

| Doc | Owns |
| --- | --- |
| [`jobs-orpc.md`](jobs-orpc.md) | Jobs path, oRPC, evlog |
| [`caps-boundary.md`](caps-boundary.md) | Caps SPI, credentials, Intake, Export |
| [`types.md`](types.md) | Schema / vocab ownership |
| [`caps-lexicon.md`](caps-lexicon.md) | Cap id/title/kind, D1-D5 |
