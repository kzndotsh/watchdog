# Effect library docs (installed package)

Load this when: looking up Effect API syntax, examples, or module docs
while working under `/effect`. Prefer these paths over web scrapes.

**Index:** `node_modules/effect/AGENTS.md` (read completely first)  
**Source:** `node_modules/effect/src/`  
**Schema deep dive:** [SCHEMA.md](https://github.com/Effect-TS/effect/blob/main/packages/effect/SCHEMA.md)

Optional local clone `repos/effect/` (gitignored) may mirror the same guide /
`ai-docs`; do not import it. `https://effect.website/llms.txt` currently 404.

## Watchdog-relevant sections

Topics below are named in `node_modules/effect/AGENTS.md`. Open that file and
follow its links; then search `node_modules/effect/src` for APIs the guide
skips.

| Need | Where in the Effect guide |
| --- | --- |
| `Effect.gen` / `Effect.fn` | Writing Effect code |
| `Context.Service` / Layers | Writing Effect services |
| Tagged errors / `catchTag(s)` | Error handling |
| Scope / acquireRelease | Managing resources and Scopes |
| `NodeRuntime.runMain` | Running Effect programs |
| Streams | Working with Streams |
| `ManagedRuntime` | Integrating Effect into existing applications |
| `Schedule` | Working with Schedules |
| Logging / spans | Observability |
| `it.effect` / TestClock | Testing Effect programs |
| `HttpClient` | Effect HttpClient |

## Do not copy into Watchdog

| Effect guide topic | Why |
| --- | --- |
| Effect `Schema` as domain SoT | Caps/API/wire stay on Zod (`@watchdog/schemas`) |
| `@effect/sql` / Model.Class | Postgres SoT is Drizzle (`@watchdog/db`) |
| `HttpApi` servers | HTTP is oRPC (`@watchdog/api`), not Effect HttpApi |
| `@effect/ai*` LanguageModel | `@watchdog/ai` stays on Vercel AI SDK for now |
| Cluster / Effect CLI modules | Out of scope |

Apply Watchdog edges from this skill — library examples are not license to add
new `run*` sites or revive identity Layers.
