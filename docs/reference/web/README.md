# Watchdog web docs

Agents: start at [`../../../apps/web/AGENTS.md`](../../../apps/web/AGENTS.md), then open the leaf that matches. Platform docs: [`docs/README.md`](../../README.md).

| Doc | Owns | Does not own |
| --- | --- | --- |
| [`architecture.md`](architecture.md) | Start/Vite/Router, chrome, web server-fn boundary | Package import graph, Caps (→ [`../platform/README.md`](../platform/README.md)) |
| [`domains.md`](domains.md) | `src/domains/*` ownership map, hooks/lib, Page ownership | Flows, tokens |
| [`data.md`](data.md) | Query cache, Case cookie, SSE, invalidation | Cap worker internals |
| [`UI.md`](UI.md) · [`ui/`](ui/README.md) | Design system, loading, tables, atoms (split under `ui/`) | Product flows, copy |
| [`components.md`](components.md) | Hand-owned atom registry | Brand brief, Storybook |
| [`../../contributing/testing/web.md`](../../contributing/testing/web.md) | Web gates + remaining manual smoke | Platform test index |

**Platform:** [`product`](../../explanation/product.md) · [`ux`](../../explanation/ux.md) · [`types`](../platform/types.md) · [`caps-lexicon`](../platform/caps-lexicon.md) · [`scenarios`](../../explanation/scenarios.md) · [`platform hub`](../platform/README.md).

Code SoT: `apps/web/src/styles.css` + `shared/ui/`. Loading: [`ui/loading.md`](ui/loading.md). Tables: [`ui/tables.md`](ui/tables.md).

## Traps index

| Symptom | Doc |
| --- | --- |
| Vite / pnpm allowBuilds / routeTree / no Next.js | [`../../how-to/local-dev.md#gotchas`](../../how-to/local-dev.md#gotchas) |
| Auth session / CSRF / ServerFn auth | [`../../how-to/auth-setup.md#gotchas`](../../how-to/auth-setup.md#gotchas) |
| Evlog `log.set({ error })` | [`../contracts/evlog.md#gotchas`](../contracts/evlog.md#gotchas) |
| Router loaders / ServerFn imports | [`architecture.md#gotchas`](architecture.md#gotchas) |
| Active Case / PageHeader / scroll restoration | [`ui/page-shell.md#gotchas`](ui/page-shell.md#gotchas) |
| Loading / Navigate sibling / QueueShell | [`ui/loading.md#gotchas`](ui/loading.md#gotchas) |
| Nested buttons / opaque ids / theme | [`ui/atoms.md#gotchas`](ui/atoms.md#gotchas) |
| DataTable / Identifiers table | [`ui/tables.md#gotchas`](ui/tables.md#gotchas) |
| Domains vocab / Tasks / Dashboard | [`domains.md#gotchas`](domains.md#gotchas) |
| QueryClient / SSE | [`data.md#gotchas`](data.md#gotchas) |
| Case shell IA | [`../../explanation/ux.md#gotchas`](../../explanation/ux.md#gotchas) |
| Stop hook / plans-not-SoT / duplicate React | [`../../contributing/ci-gates.md#gotchas`](../../contributing/ci-gates.md#gotchas) |
