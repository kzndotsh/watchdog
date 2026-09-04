# Cap SDK (`@watchdog/cap-sdk`)

> Scope: `packages/cap-sdk` (inherits root [AGENTS.md](../../AGENTS.md) unless noted)

SPI for Caps: `defineCapability`, CapContext, interpret types. No Graph / DB / network helpers.

`run` is `Effect<CapRunResult, ToolsTag, CapServices>` (`CapRun`). `CapServices` is `HttpClient` (`toolsHttpClientLayer` provided by `runCap` / job collect). `interpret` stays pure/sync. Cap I/O on `CapContext` is Effect (`uploadArtifact`, `getCredential`, `hasCredential`, `readArtifact`); optional slots use `optionalCapCredential`. `signal` stays AbortSignal.

Cap `run()` tests call `runCap` (Promise edge; provides HttpClient). Job collect yields `cap.run(ctx)` under `toolsHttpClientLayer` — do not wrap leftover async bodies; Caps are Effect.

## Commands

| Task       | Command                                     |
| ---------- | ------------------------------------------- |
| Typecheck  | `pnpm --filter @watchdog/cap-sdk typecheck` |
| Unit tests | `pnpm test:unit`                            |

## Boundaries

| Do | Don’t |
| --- | --- |
| Keep types + `defineCapability` / `runCap` | Import `@watchdog/db`, `core`, or apps |
| Document `timeoutMs` / credential hooks on the Cap | Put secrets in `Job.input` |

## Gotchas

- `handoff?: (report) => JobHandoff | undefined` is pure; core persists bags on Job success (including cache hits). Independent of `produces`.
- `CapIoKind` includes `hash` (playbook seed / bind). Fail-closed Identifier filtering lives in caps `interpret-identifier-batches`; this package does not implement it.

## See also / External References

| Need                | File                                           |
| ------------------- | ---------------------------------------------- |
| Cap implementations | [`packages/caps/AGENTS.md`](../caps/AGENTS.md) |
