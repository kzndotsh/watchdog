# Watchdog platform docs

Agents: start at root [`AGENTS.md`](../AGENTS.md), then open the doc that matches the question. Web UI implementation contracts live under [`apps/web/docs/`](../apps/web/docs/README.md).

| Doc | Owns | Does not own |
| --- | --- | --- |
| [`CAPS.md`](CAPS.md) | Cap id/title/kind lexicon, method vocabulary, D1–D5, ship gates; live catalog size via `generate:caps` | Cap SPI / Job runner (ARCHITECTURE) |
| [`PRODUCT.md`](PRODUCT.md) | Intent, personas, anti-patterns, design doctrine, rewrite lessons | Phase checkboxes, pixels, route chrome |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Package layout, import graph, Collect/Triage/Caps/Export, oRPC, process logging (evlog) | Start/Vite pixels, IA |
| [`TYPES.md`](TYPES.md) | `@watchdog/schemas`, Zod, vault vs platform vocab | Pixels, IA |
| [`UX.md`](UX.md) | IA, investigator flows, empty/error _meaning_, copy, experience debt | Component APIs, color tokens |
| [`SCENARIOS.md`](SCENARIOS.md) | Walked Day-0 journeys vs code (`shipped` / `partial` / `missing` / `lying`) | Cap unit tests, chrome lexicon |
| [`TESTING.md`](TESTING.md) | Monorepo test index + commands | Web DS gates + remaining manual smoke (see web TESTING) |
| [`TESTING_STANDARDS.md`](TESTING_STANDARDS.md) | How to write tests (anti-cheat, naming, pyramid) | Command cheat-sheet (TESTING.md) |

**PRODUCT vs UX vs UI vs SCENARIOS:** PRODUCT = why / who / refuse. UX = how investigators experience the product. UI = how we build the interface ([`apps/web/docs/UI.md`](../apps/web/docs/UI.md)). SCENARIOS = which journeys actually complete end-to-end.

`.cursor/plans/` (incl. `_archived/`) are historical implementation notes — durable contracts live here and under `apps/web/docs/`, not in plans.
