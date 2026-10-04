# ADR-0001: Zod is the boundary schema library

**Status:** accepted (2026-10-04) · closes [#47](https://github.com/kzndotsh/watchdog/issues/47) **What this is:** which schema library validates data that crosses a process or package boundary, why it is Zod and not Effect Schema, and what would reopen the decision. **What this is not:** a rule for every internal type (see [`types.md`](../reference/platform/types.md)) or a migration plan.

## Decision

Zod (`zod` 4, from the pnpm catalog) defines every schema that crosses a boundary:

- oRPC contracts and the generated OpenAPI document and client
- TanStack Form and server-function validators
- environment configuration (`@watchdog/env`)
- Cap input, output and report schemas (`@watchdog/caps`, `@watchdog/tools`)
- the shared vocabulary and input schemas in `@watchdog/schemas`

Effect Schema is allowed only for Effect-native internals that never cross a boundary, such as `Schema.TaggedError` classes, and only where it earns its keep. It is not used to define a second copy of a boundary shape. When a value needs both, Zod is the source and the Effect-side type is derived from the Zod output type.

This departs from `node_modules/effect/AGENTS.md`, which tells agents to use Effect Schema for validation. The root `AGENTS.md` Effect section points here.

## Why

- **Our OpenAPI depends on Zod.** `packages/api/src/openapi.ts` and the web OpenAPI handler use oRPC's `ZodToJsonSchemaConverter`. oRPC documents converters for Zod, Valibot and ArkType, not Effect. An Effect schema would validate through Standard Schema, but OpenAPI generation from it is unproven.
- **Every integration speaks Zod natively:** oRPC, TanStack Form, `@t3-oss/env-core`, Drizzle's schema generators, the AI SDK.
- **The bridge from Effect Schema is lossy.** `Schema.toStandardSchemaV1` accepts only schemas with no required services, can return a Promise, and loses paths on defects. TanStack Form does not hand back transformed values, so a transforming schema behaves differently on the form side. A known TanStack DB issue shows the failure mode for consumers that assume input and output types match.
- **Size of the move.** At the time of writing, 275 files and about 1,780 `z.` call sites use Zod (`packages/caps` 128 files, `packages/tools` 59, `packages/schemas` 37) and none use Effect Schema.
- **Weight on the client.** Zod 4 core is about 5 kB gzipped, and the web client needs validation without pulling in more of Effect.

## Consequences

- Effect Schema is not banned. Using it for a tagged error is fine; defining an input schema in it is not.
- Zod 4.x minors have shipped small behaviour changes (4.5 changed datetime and string-length rules, 4.6 changed error maps). Review Zod upgrades and keep boundary-schema tests meaningful.
- Keep schemas expressible as Standard Schema, so the library can be swapped later without touching consumers.
- Zod is effectively a single-maintainer project. That is accepted, with the Standard Schema escape hatch as the mitigation.

## Reopen when

- oRPC supports Effect Schema for OpenAPI generation without a custom converter, or
- the product needs real bidirectional encode and decode across the wire (the wire format differs from the domain type and the difference is load-bearing), or
- Zod stops being maintained or breaks the Standard Schema contract.

## Considered

- **Migrate everything to Effect Schema.** One vocabulary with errors and services, native brands and classes. Rejected: very large change, unproven OpenAPI path, lossy bridge at every boundary, and Schema v4 only went stable on 2026-10-01 after real API churn through beta and rc.
- **Hybrid with Effect Schema as the source.** Define once in Effect, derive Standard Schema for forms, env and oRPC. Feasible for synchronous schemas with no services, but the OpenAPI output is the unproven part, and it leaves two vocabularies for agents to mix up.
