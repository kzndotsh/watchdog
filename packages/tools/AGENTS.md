# Tools package (`@watchdog/tools`)

> Scope: `packages/tools` (inherits root AGENTS.md)

Dumb HTTP / DNS / WHOIS / CT / breach / threat helpers: raw fetch/parse output only. No Graph, Cap types, or DB (held by `package.json`). Caps orchestrate these in `run` and pass their own OPSEC UA/limits as params.

## Commands

| Task       | Command                                   |
| ---------- | ----------------------------------------- |
| Typecheck  | `pnpm --filter @watchdog/tools typecheck` |
| Unit tests | `pnpm test:unit`                          |

## Rules

- **Import via per-domain subpaths** (`@watchdog/tools/{archive,breach,cache,ct,dns,errors,file,html,http,identity,network,parse,threat,tls,wayback,whois}`), each declared in `package.json` `exports` and backed by `src/<domain>/index.ts`. There is no root import: the bare `@watchdog/tools` is not exported, and `check:boundaries` fails an undeclared specifier with the list of public subpaths. A new vendor export goes in its domain `index.ts`. Guidance.

- **Producer Zod + inferred types live here**, next to the fetch/parse (`dns/schema.ts`, `whois/schema.ts`, `http/oembed.ts`, per-vendor snapshots). Caps import them from the domain subpath (`@watchdog/tools/dns`, `/whois`, `/http`, …) for `safeParse` (no Cap-local re-export); do not duplicate shapes as TS interfaces in Caps. Guidance.
- Vendor clients export `*Effect` only and never call raw `fetch` (exceptions: `http-probe` / `unshorten` need `redirect: "manual"` / HEAD→GET, wrapped in `Effect.tryPromise`). HTTP helpers (`fetchJson*Effect`, `fetchBytesEffect`) require `HttpClient` in `R`: provide `toolsHttpClientLayer` once at the Cap `run` / collect / test root, not per request.
- Tagged vendor failures live in `src/errors/tagged-errors.ts` (`vendor-errors.ts` has the short constructors). Each tag has a unique `code` and derives its `message` from its fields. Tools has no other error family: throw or return a tag, `mapToolsCatch` classifies by class only (never by message text), and core maps tags to core tags by tag name (`toDomainTag`). Never parse a message to recover a tag.
- Shared parse helpers stay Cap-agnostic: Caps choose how to map results into PatchOps.
- Tests: Effect programs use `@effect/vitest` `it.effect` with `Effect.provide(toolsHttpClientLayer)`; pass `retry: false` only when stubbing a single fetch. Vendor parse-shape tests run against checked-in `__fixtures__`; mock HTTP via `@watchdog/test-kit/http`.
