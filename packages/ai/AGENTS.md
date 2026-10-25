# AI package (`@watchdog/ai`)

> Scope: `packages/ai` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

LLM provider helpers (Vercel AI SDK) plus `structuredExtractEffect` and draft Zod. Used by Caps such as `extract.ai`. It never writes Graph: it returns structured drafts for Cap `interpret` or humans, and LLM output is never `confirmed`.

## Commands

| Task       | Command                                |
| ---------- | -------------------------------------- |
| Typecheck  | `pnpm --filter @watchdog/ai typecheck` |
| Unit tests | `pnpm test:unit`                       |

## Gotchas

- `structuredExtractEffect` fails with `RateLimitedOutputError` / `InvalidOutputError`; Caps `yield*` it.
- API keys come through Cap ctx / vault (root Boundaries), not env.
- A Job's model call sends with the `fetch` the Cap got from `Egress.llmFetchFor(origin)` (`createWatchdogModel(config, { fetch })`): that door admits the origin, refuses redirects and records the response hash-only ([`caps-boundary`](../../docs/reference/platform/caps-boundary.md#outbound-http)). Never build a model without it inside a Cap.
