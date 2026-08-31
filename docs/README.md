# Watchdog docs

Agents: start at root [`AGENTS.md`](../AGENTS.md), then open the leaf that matches the question. One tree under `docs/`: platform + web namespaces (`reference/platform/`, `reference/web/`, `reference/contracts/`).

**PRODUCT vs UX vs UI vs SCENARIOS:** PRODUCT = why / who / refuse. UX = how investigators experience the product. UI = how we build the interface. SCENARIOS = which journeys actually complete end-to-end.

`.cursor/plans/` (incl. `_archived/`) are historical: durable contracts live here, not in plans.

Documentation charter (Diátaxis, page shape, update rules): [`explanation/documentation.md`](explanation/documentation.md).

## Start by role

| Role | Start here | Then |
| --- | --- | --- |
| **New builder** | [`tutorials/first-investigation.md`](tutorials/first-investigation.md) | [`how-to/onboarding.md`](how-to/onboarding.md) · [`how-to/local-dev.md`](how-to/local-dev.md) |
| **Investigator (UI)** | [`explanation/product.md`](explanation/product.md) | [`explanation/ux.md`](explanation/ux.md) · [`explanation/scenarios.md`](explanation/scenarios.md) |
| **Agent / CLI** | [`how-to/agent-cli.md`](how-to/agent-cli.md) | [`reference/contracts/agent-ingress.md`](reference/contracts/agent-ingress.md) · OpenAPI `/api/v1/` |
| **Contributor** | [`contributing/ci-gates.md`](contributing/ci-gates.md) | [`contributing/testing/index.md`](contributing/testing/index.md) |
| **Stuck locally** | [`how-to/troubleshooting.md`](how-to/troubleshooting.md) | [`reference/web/README.md#traps-index`](reference/web/README.md#traps-index) |

## Tutorials

| Doc | Owns |
| --- | --- |
| [`tutorials/first-investigation.md`](tutorials/first-investigation.md) | First Case: dump → Process → Triage Accept → Dossier |

## Explanation

| Doc | Owns | Does not own |
| --- | --- | --- |
| [`explanation/product.md`](explanation/product.md) | Intent, personas, refuse | Phase checkboxes, pixels |
| [`explanation/ux.md`](explanation/ux.md) | IA, flows, copy meaning | Component APIs, tokens |
| [`explanation/scenarios.md`](explanation/scenarios.md) | Walked journeys (`shipped` / `partial` / `missing` / `lying`) | Cap unit tests |
| [`explanation/documentation.md`](explanation/documentation.md) | Doc IA charter (Diátaxis) | Gate scripts |

## Reference: contracts

| Doc | Owns |
| --- | --- |
| [`reference/contracts/README.md`](reference/contracts/README.md) | Contracts index |
| [`reference/contracts/ingress.md`](reference/contracts/ingress.md) | Collect → Graph loop |
| [`reference/contracts/custody.md`](reference/contracts/custody.md) | Accept tiers / gates |
| [`reference/contracts/agent-ingress.md`](reference/contracts/agent-ingress.md) | Agent graph write |
| [`reference/contracts/evlog.md`](reference/contracts/evlog.md) | Process logging |

## Reference: platform

| Doc | Owns | Does not own |
| --- | --- | --- |
| [`reference/platform/README.md`](reference/platform/README.md) | Architecture hub | Web Start chrome |
| [`reference/platform/packages.md`](reference/platform/packages.md) | Import matrix | Cap SPI detail |
| [`reference/platform/jobs-orpc.md`](reference/platform/jobs-orpc.md) | Jobs, oRPC, evlog | Cap lexicon |
| [`reference/platform/caps-boundary.md`](reference/platform/caps-boundary.md) | Caps SPI, credentials, Intake, Export | Cap D1-D5 |
| [`reference/platform/types.md`](reference/platform/types.md) | Schema / vocab ownership | Pixels, IA |
| [`reference/platform/caps-lexicon.md`](reference/platform/caps-lexicon.md) | Cap lexicon, D1-D5, ship gates | Cap SPI / Job runner |
| [`reference/platform/graph-model.md`](reference/platform/graph-model.md) | Graph model (entities, patch ops) | UI domains map |

## How-to

Index: [`how-to/README.md`](how-to/README.md).

| Doc | Owns |
| --- | --- |
| [`how-to/onboarding.md`](how-to/onboarding.md) | First-run setup |
| [`how-to/local-dev.md`](how-to/local-dev.md) | Wipe, test-db, toolchain traps |
| [`how-to/vault-setup.md`](how-to/vault-setup.md) | Vault / Cap credentials |
| [`how-to/auth-setup.md`](how-to/auth-setup.md) | BA session, CSRF, ServerFn auth |
| [`how-to/agent-cli.md`](how-to/agent-cli.md) | `wd` CLI + OpenAPI agents |
| [`how-to/troubleshooting.md`](how-to/troubleshooting.md) | Symptom → fix |

## Contributing

| Doc | Owns | Does not own |
| --- | --- | --- |
| [`contributing/ci-gates.md`](contributing/ci-gates.md) | lefthook, CI, regen, stop-gate | Test methodology |
| [`contributing/testing/index.md`](contributing/testing/index.md) | Monorepo test index | Web DS gates |
| [`contributing/testing/standards.md`](contributing/testing/standards.md) | How to write tests | Command cheat-sheet |
| [`contributing/testing/web.md`](contributing/testing/web.md) | Web DS gates + smoke | Platform pyramid |

## Reference: web

| Doc | Owns |
| --- | --- |
| [`reference/web/README.md`](reference/web/README.md) | Web index + [traps index](reference/web/README.md#traps-index) |
| [`reference/web/architecture.md`](reference/web/architecture.md) | Start/Vite/Router, chrome boundary |
| [`reference/web/domains.md`](reference/web/domains.md) | Domain ownership map |
| [`reference/web/data.md`](reference/web/data.md) | Query / Case cookie / SSE |
| [`reference/web/components.md`](reference/web/components.md) | Atom registry |
| [`reference/web/UI.md`](reference/web/UI.md) | UI hub → `ui/` leaves |
| [`reference/web/ui/README.md`](reference/web/ui/README.md) | Delivery gates, chrome lexicon |
| [`reference/web/ui/tokens.md`](reference/web/ui/tokens.md) | Colors, type, refuse list |
| [`reference/web/ui/page-shell.md`](reference/web/ui/page-shell.md) | Page / trail / toolbar |
| [`reference/web/ui/forms.md`](reference/web/ui/forms.md) | Form library |
| [`reference/web/ui/tables.md`](reference/web/ui/tables.md) | Column sizing + DataTable pending |
| [`reference/web/ui/loading.md`](reference/web/ui/loading.md) | Skeletons + hydration rules |
| [`reference/web/ui/atoms.md`](reference/web/ui/atoms.md) | Hand-owned atom highlights |
| [`reference/web/ui/motion.md`](reference/web/ui/motion.md) | Operate motion |
| [`reference/web/ui/multi-mode.md`](reference/web/ui/multi-mode.md) | Detail / composers |
