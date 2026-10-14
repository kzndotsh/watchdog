# ADR-0006: Test tiers map to test size: small, medium, large

**Status:** accepted (2026-10-14) · part of [#269](https://github.com/kzndotsh/watchdog/issues/269), slice [#274](https://github.com/kzndotsh/watchdog/issues/274) **What this is:** what "unit", "component", "gate" and the other tier names mean in terms of what a test may touch, and which tier a new test goes in. **What this is not:** the runner facts and commands ([`testing/index.md`](../contributing/testing/index.md)) or how to write a good test ([`testing/standards.md`](../contributing/testing/standards.md)).

## Context

The tier names drifted from what the suite does. The CI job called "Unit" ran four Vitest projects (`unit`, `web-unit`, `property`, `component`), about a quarter of its files rendered React in a DOM, and the written tier table said web `*.test.ts` files ran in the component project when most ran in `web-unit`. Two CLI "unit" tests spawned `tsx` per case, one "unit" test wrote a probe directory into the source tree, and the `gate` project, 22% of test cases, spent most of its time spawning real processes. A name that does not say what a test may touch cannot tell a contributor where a new test goes or what a green run proved.

Google's test-size vocabulary (small, medium, large) defines a test by its resources, not its subject: a small test runs in one process with no network, database or real wait; a medium test may use several processes and local services on one machine; a large test needs the full system. It fits this repo's tiers without renaming a Vitest project.

## Decision

1. **Every tier has a size, and the size is the rule for what the test may touch.**

   | Size | May touch | Tiers (Vitest project) |
   | --- | --- | --- |
   | Small | One process: memory, fake timers, boundary doubles (MSW, `vi.stubGlobal` for the network), a DOM (happy-dom). No database, no spawned process, no real wait, no network | `unit`, `web-unit`, `property`, `component`, `e2e-parser` |
   | Medium | Several processes and local services on one machine: Postgres and S3 on loopback, spawned scripts and oxlint in a temporary repo | `integration`, `gate` |
   | Large | The whole system: a browser, the web server, the worker and a database | Playwright e2e (`e2e/specs/`) |

2. **Write the smallest test that can fail for the bug.** A rule in a pure function is a small test of that function. Reach for a medium test only when the bug lives in the seam (SQL, a transaction, a script's exit code, a lint rule's real behaviour under oxlint), and for a large test only when no smaller one can see it (hydration, a route across the real stack).
3. **A small test never spawns a process or writes outside a temporary directory.** A test that needs either is a medium test and belongs in `gate` (scripts and lint rules) or `integration` (databases). The CLI tests call `boot()` in-process; one spawn smoke keeps the real entry point honest.
4. **The CI job name says the sizes and tiers it runs.** "Unit, property and component tests" is the small tiers; "Gate tests" and "Integration" are the medium ones; "Playwright e2e" is the large one. `ci-workflow.gate.test.ts` fails when the combined job's name omits a tier it runs.
5. **Local commands say what they cover.** `pnpm test` runs `unit`, `web-unit`, `property` and `gate`; `component`, `integration` and e2e are separate commands. The pre-push hook runs the gate tests only when `scripts/**`, workflow or Vitest config files change. Both are stated in [`testing/index.md`](../contributing/testing/index.md#what-runs-where) and are not a promise that a push ran the unit or component tiers.

## Consequences

- A contributor placing a new test asks one question (what must it touch?) instead of guessing among six names.
- Small tests share workers (`isolate: false`) and are held to the restore rule and the leak canary; medium tests may use their own process and a longer timeout.
- A test that grows a database or a spawned process outgrows its tier and moves, rather than bending the tier's meaning.
- The `gate` project stays medium: its cost is the processes it spawns, so a gate suite is simplified to pure functions where the rule can be (as the oxlint baseline script's decisions now are) and keeps real spawns only for wiring.

## Considered

- **Rename the Vitest projects to small, medium and large.** Loses the subject (unit versus component versus property) that tells a reader how to write the test, and churns every command and workflow for no new rule.
- **Keep the old tier names and fix only the table.** The table was already wrong once; without a resource rule it drifts again.
- **Move `component` to a Vitest browser-mode project.** A real browser makes it a medium test by decision 1, so overlay, focus and drag components would be a separate medium project beside `component`, not a replacement. Measured in #274 and not adopted: see the recommendation in that pull request.

## Reopen when

- a test tier needs a resource this table does not allow (a real browser inside a small test, a live vendor call), or
- CI moves the combined job's tiers into separate jobs, which makes decision 4 simpler.
