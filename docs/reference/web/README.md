# Watchdog web docs

Start with [`../../../apps/web/AGENTS.md`](../../../apps/web/AGENTS.md), then open the relevant leaf. Platform docs are in [`docs/README.md`](../../README.md). Design direction and taste rules are in [`/DESIGN.md`](../../../DESIGN.md); the CSS in `apps/web/src/styles/` and the components in `shared/ui/` are the source of truth for values. The style guide page is `/ui`.

| Doc | Owns |
| --- | --- |
| [`architecture.md`](architecture.md) | Start/Router/Vite shape, auth layers, web server-fn boundary, oRPC wiring |
| [`domains.md`](domains.md) | `src/domains/*` folder shape, page ownership, cross-domain rules |
| [`data.md`](data.md) | Query cache, Case cookie, invalidation contracts, SSE |
| [`ui/README.md`](ui/README.md) | Chrome lexicon, delivery rules |
| [`ui/rules.md`](ui/rules.md) | Each UI rule and what enforces it |
| [`ui/page-shell.md`](ui/page-shell.md) · [`ui/loading.md`](ui/loading.md) · [`ui/tables.md`](ui/tables.md) · [`ui/forms.md`](ui/forms.md) · [`ui/atoms.md`](ui/atoms.md) | Page chrome, loading doctrine, tables, forms, atoms and keyboard |
| [`ui/vendor.md`](ui/vendor.md) · [`ui/auth-ui.md`](ui/auth-ui.md) | Vendored primitives; owned auth screens |

Also: [`product`](../../explanation/product.md), [`ux`](../../explanation/ux.md), [`types`](../platform/types.md), [`caps-lexicon`](../platform/caps-lexicon.md), [`platform hub`](../platform/README.md).

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
| Stop hook / plans-not-SoT / duplicate React | [`../../contributing/ci-gates.md#gotchas`](../../contributing/ci-gates.md#gotchas) |
