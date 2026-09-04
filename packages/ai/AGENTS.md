# AI package (`@watchdog/ai`)

> Scope: `packages/ai` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

LLM provider helpers + `structuredExtractEffect` / draft Zod. Used by Caps (e.g. extract.ai) — never writes Graph.

## Commands

| Task       | Command                                |
| ---------- | -------------------------------------- |
| Typecheck  | `pnpm --filter @watchdog/ai typecheck` |
| Unit tests | `pnpm test:unit`                       |

## Boundaries

| Do | Don’t |
| --- | --- |
| Return structured drafts for Cap `interpret` / humans | Treat LLM output as `confirmed` Graph |
| Read credentials via Cap ctx / vault patterns | Put API keys in env for Caps |

`structuredExtractEffect` wraps Vercel AI SDK with `RateLimitedOutputError` / `InvalidOutputError`. Caps `yield*` it. `@effect/ai-openai` / `@effect/ai-anthropic` ship `4.0.0-rc.112` but this package stays on the Vercel AI SDK until a dedicated provider swap.

## See also / External References

| Need        | File                                           |
| ----------- | ---------------------------------------------- |
| Caps        | [`packages/caps/AGENTS.md`](../caps/AGENTS.md) |
| Env / vault | [`packages/env/AGENTS.md`](../env/AGENTS.md)   |
