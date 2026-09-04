# Tools package (`@watchdog/tools`)

> Scope: `packages/tools` (inherits root AGENTS.md)

Dumb HTTP / DNS / WHOIS / CT / breach / threat helpers — raw fetch/parse output only. No Graph, Cap types, or DB.

## Commands

| Task       | Command                                   |
| ---------- | ----------------------------------------- |
| Typecheck  | `pnpm --filter @watchdog/tools typecheck` |
| Unit tests | `pnpm test:unit`                          |

## Rules

- Caps own `interpret` and Cap-local `report-schema.ts` **re-exports**; **producer Zod + inferred types** live in tools next to the fetch/parse (e.g. `dns/schema.ts`, `whois/schema.ts`, `http/oembed.ts`, plus per-vendor snapshots under `src/`). Caps import those schemas for `safeParse` — do not duplicate shapes as TS interfaces in Caps, and do not re-export snapshot types from Cap `interpret.ts` (use `report-schema.ts` or `@watchdog/tools`).
- Keep helpers side-effect free aside from network I/O they wrap.
- Tagged vendor failures (`RateLimitedError`, `HttpVendorError`, `ParseVendorError`, `MissingCredentialError`, `ValidationVendorError`) live in `src/errors/tagged-errors.ts`. Map to/from `ToolsError` via `taggedToToolsError` / `mapToolsCatch`. HTTP JSON: `fetchJsonObjectEffect` / `fetchJsonUnknownEffect` (`src/http/fetch-json.ts`) require `HttpClient` in `R` — provide `toolsHttpClientLayer` once at Cap `run` / collect / vitest roots (not per request). POST/PUT/PATCH/DELETE forward `init.body`. Pass `retry: false` only in tests that stub a single fetch. Tools unit tests that run Effects use `@effect/vitest` `it.effect` (`yield*` the `*Effect`, `Effect.result` for tagged failures) + `Effect.provide(toolsHttpClientLayer)`.
- HTTP bytes: `fetchBytesEffect` (`src/http/fetch-bytes.ts`) — same `HttpClient` / `toolsHttpClientLayer`; abort maps to `{ ok: false, error }`. Vendor JSON clients export `*Effect` only. Vendor clients must not call raw `fetch`. `http-probe` / `unshorten` still use fetch for `redirect: "manual"` / HEAD→GET fallback, wrapped in `Effect.tryPromise`.
- Do not import `@watchdog/db`, `core`, `caps`, or apps.
- Shared parse helpers (e.g. `parse/classify-breach-query.ts` for DeHashed/Snusbase query typing) stay Cap-agnostic — Caps choose how to map into PatchOps.
- DNS: `resolveDnsRecordsEffect`, mail/TXT/reverse (`src/dns/`). `runAbortableResolver` takes an Effect body; NXDOMAIN uses `dnsOrEmpty`. WHOIS: `fetchRdapWhoisEffect`, `fetchWhoisXmlEffect`, `normalizeHost` (`src/whois/`). WHOIS snapshots: optional `registeredAt` / `expiresAt` (`.nullish()`); `parseWhoisDate` returns `null` on invalid input. HTML/md: helpers under `src/html/` (incl. `sniff.ts`). HTTP: `fetchBytesEffect`, probes, unshorten, page enrich, oEmbed (`src/http/`). TLS: `src/tls/`. Wayback CDX / submit: `src/wayback/`. Vendor / corpus clients under `src/{ct,network,threat,breach,identity,archive,file}/`. Caps orchestrate these in `run` (often via `defineCollectCap`) and pass Cap OPSEC UA/limits as params.
- **Tests:** shared HTTP + pure parsers (classify/coerce/sniff/file/eml/ttl-memory). Vendor parse-shape: `src/{identity,network,threat}/__tests__/public-schema.test.ts` against checked-in `__fixtures__` (not live HTTP, not one MSW file per vendor). Wayback: `src/wayback/__tests__/cdx.test.ts` + `submit.test.ts`. Mock HTTP via `@watchdog/test-kit/http`.
