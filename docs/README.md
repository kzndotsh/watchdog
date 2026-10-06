# Watchdog docs

Agents: start at root [`AGENTS.md`](../AGENTS.md), then open the leaf that matches the question. One tree under `docs/`; platform, web and contracts are namespaces under `reference/`. Design direction and taste rules live in [`DESIGN.md`](../DESIGN.md) at the repo root. `.cursor/plans/` are historical: durable contracts live here, not in plans.

Policy: every stated convention is enforced by a lint rule or gate, labeled guidance, or deleted; the one table is [`reference/platform/conventions.md`](reference/platform/conventions.md).

Which doc gets updated with which code change is `scripts/doc-map.mjs`, enforced by `pnpm check:docs-affected:strict` ([`contributing/ci-gates.md`](contributing/ci-gates.md)).

## Start by role

| Role | Start here | Then |
| --- | --- | --- |
| **New builder** | [`tutorials/first-investigation.md`](tutorials/first-investigation.md) | [`how-to/local-dev.md`](how-to/local-dev.md) · [`how-to/auth-setup.md`](how-to/auth-setup.md) |
| **Investigator (UI)** | [`explanation/product.md`](explanation/product.md) | [`explanation/ux.md`](explanation/ux.md) |
| **Agent / CLI** | [`how-to/agent-cli.md`](how-to/agent-cli.md) | [`reference/contracts/agent-ingress.md`](reference/contracts/agent-ingress.md) · OpenAPI `/api/v1/` |
| **Contributor** | [`contributing/ci-gates.md`](contributing/ci-gates.md) | [`contributing/testing/index.md`](contributing/testing/index.md) |
| **Marketing site** | [`../apps/site/README.md`](../apps/site/README.md) | [`how-to/local-dev.md`](how-to/local-dev.md) (port 3001) |
| **Stuck locally** | [`how-to/troubleshooting.md`](how-to/troubleshooting.md) | [`reference/web/README.md#traps-index`](reference/web/README.md#traps-index) |

## Tutorials and explanation

- [`tutorials/first-investigation.md`](tutorials/first-investigation.md): first Case, dump → Process → Triage Accept → Dossier.
- [`../GLOSSARY.md`](../GLOSSARY.md): product nouns, custody tiers and retired vocabulary (wins on product nouns; the agents gate reads its banned terms).
- [`explanation/product.md`](explanation/product.md): intent, doctrine, personas, refuse list.
- [`explanation/ux.md`](explanation/ux.md): how investigators experience the product.
- Decision records: [`adr/0001-zod-at-the-boundary.md`](adr/0001-zod-at-the-boundary.md) (Zod is the boundary schema library), [`adr/0002-effect-services-and-layers.md`](adr/0002-effect-services-and-layers.md) (infrastructure moves to Effect services and Layers, in phases), [`adr/0003-branded-ids.md`](adr/0003-branded-ids.md) (branded IDs, starting with OrganizationId and CaseId), [`adr/0005-unified-activity-log.md`](adr/0005-unified-activity-log.md) (accepted: one append-only activity log feeds Recent activity and the live-update signal).

## Reference: contracts

| Doc | Owns |
| --- | --- |
| [`reference/contracts/README.md`](reference/contracts/README.md) | Contracts index, error taxonomy, org isolation |
| [`reference/contracts/ingress.md`](reference/contracts/ingress.md) | Collect → Graph loop |
| [`reference/contracts/custody.md`](reference/contracts/custody.md) | Accept tiers, gates, identifier collisions |
| [`reference/contracts/agent-ingress.md`](reference/contracts/agent-ingress.md) | Agent propose vs graph write |
| [`reference/contracts/evlog.md`](reference/contracts/evlog.md) | Process logging rules |

## Reference: platform

| Doc | Owns |
| --- | --- |
| [`reference/platform/README.md`](reference/platform/README.md) | Platform hub |
| [`reference/platform/packages.md`](reference/platform/packages.md) | Import matrix and its enforcement |
| [`reference/platform/jobs-orpc.md`](reference/platform/jobs-orpc.md) | Jobs path, oRPC/OpenAPI, evlog wiring |
| [`reference/platform/caps-boundary.md`](reference/platform/caps-boundary.md) | Cap SPI, credentials, Intake, Export |
| [`reference/platform/caps-lexicon.md`](reference/platform/caps-lexicon.md) | Cap ids, D1-D5, ship gates, playbooks |
| [`reference/platform/types.md`](reference/platform/types.md) | Schema / vocab ownership, Zod rules |
| [`reference/platform/conventions.md`](reference/platform/conventions.md) | Every convention, what enforces it, or `guidance` |

## Reference: web

| Doc | Owns |
| --- | --- |
| [`reference/web/README.md`](reference/web/README.md) | Web index + [traps index](reference/web/README.md#traps-index) |
| [`reference/web/architecture.md`](reference/web/architecture.md) | Start/Vite/Router, chrome boundary |
| [`reference/web/domains.md`](reference/web/domains.md) | Domain ownership |
| [`reference/web/data.md`](reference/web/data.md) | Query / Case cookie / SSE |
| [`reference/web/ui/README.md`](reference/web/ui/README.md) | Delivery gates, chrome lexicon |
| [`reference/web/ui/rules.md`](reference/web/ui/rules.md) | Every UI rule: reason, kind, enforcer |
| [`reference/web/ui/page-shell.md`](reference/web/ui/page-shell.md) | Page / trail / toolbar |
| [`reference/web/ui/forms.md`](reference/web/ui/forms.md) | Forms |
| [`reference/web/ui/tables.md`](reference/web/ui/tables.md) | Column sizing + DataTable pending |
| [`reference/web/ui/loading.md`](reference/web/ui/loading.md) | Skeletons + hydration |
| [`reference/web/ui/atoms.md`](reference/web/ui/atoms.md) | Hand-owned atoms + primitive wrappers |
| [`reference/web/ui/vendor.md`](reference/web/ui/vendor.md) | Vendored primitives: layers, lock, sync |
| [`reference/web/ui/auth-ui.md`](reference/web/ui/auth-ui.md) | Auth screens |

## How-to

| Doc | Owns |
| --- | --- |
| [`how-to/local-dev.md`](how-to/local-dev.md) | Ports, services, wipe, test DBs, toolchain traps |
| [`how-to/auth-setup.md`](how-to/auth-setup.md) | First account, orgs, BA session, CSRF, ServerFn auth |
| [`how-to/agent-cli.md`](how-to/agent-cli.md) | `wd` CLI + OpenAPI agents |
| [`how-to/troubleshooting.md`](how-to/troubleshooting.md) | Symptom → fix |

## Contributing and agents

| Doc | Owns |
| --- | --- |
| [`contributing/ci-gates.md`](contributing/ci-gates.md) | Gates, hooks, gate-test contract, pinning |
| [`contributing/testing/index.md`](contributing/testing/index.md) | Test tiers and runner facts |
| [`contributing/testing/standards.md`](contributing/testing/standards.md) | How to write tests |
| [`agents/issue-tracker.md`](agents/issue-tracker.md) | Where agent skills file issues (GitHub) |
| [`agents/triage-labels.md`](agents/triage-labels.md) | Triage role → label mapping |
| [`agents/domain.md`](agents/domain.md) | How skills read the glossary + ADRs |
