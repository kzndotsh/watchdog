# Watchdog web docs

Agents: start at [`../AGENTS.md`](../AGENTS.md), then open the doc that matches the question. Platform doctrine / architecture / UX live under [`docs/`](../../../docs/README.md).

| Doc | Owns | Does not own |
| --- | --- | --- |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Start/Vite/Router, chrome, web server-fn boundary | Package import graph, Caps (→ [`docs/ARCHITECTURE.md`](../../../docs/ARCHITECTURE.md)) |
| [`DOMAINS.md`](DOMAINS.md) | `src/domains/*` ownership map, `hooks/` + `lib/`, Page ownership, cross-domain rules | Flows, tokens |
| [`DATA.md`](DATA.md) | Query cache, Case cookie, SSE, invalidation contracts | Cap worker internals |
| [`UI.md`](UI.md) | Design system, tokens, atoms, chrome lexicon, loading/hydration **implementation** (incl. loading skeletons + **Tables**) | Product flows, copy |
| [`COMPONENTS.md`](COMPONENTS.md) | Hand-owned atom registry + page-chrome note (`shared/layout/`); `/ui` style guide is the living library | Brand brief, Storybook |
| [`TESTING.md`](TESTING.md) | Web gates, automated web tests, remaining manual smoke | Platform test index (→ [`docs/TESTING.md`](../../../docs/TESTING.md)) |
| [`GOTCHAS.md`](GOTCHAS.md) | Web engineering traps (Router/Query/SSR/DS) | Platform traps (→ package AGENTS) |

**Platform docs:** [`PRODUCT`](../../../docs/PRODUCT.md) · [`UX`](../../../docs/UX.md) · [`TYPES`](../../../docs/TYPES.md) · [`CAPS`](../../../docs/CAPS.md) · [`SCENARIOS`](../../../docs/SCENARIOS.md) · [`ARCHITECTURE`](../../../docs/ARCHITECTURE.md).

Code SoT for visuals: `src/styles.css` + `src/shared/ui/` (+ `shadcn/` registry). Page chrome: `src/shared/layout/` (`Page`, toolbars, `RouteError`; `RoutePending` only for `defaultPendingComponent` / future `ssr:false`). Loading: [`UI.md`](UI.md) § Loading & hydration · § Loading skeletons. Not Figma.

`.cursor/plans/` (incl. `_archived/`) are historical — durable contracts live in `docs/` + here, not in plans.
