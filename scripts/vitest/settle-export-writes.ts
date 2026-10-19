import { afterEach } from "vitest";

// Setup file of the integration project, listed after `reset-modules.ts` so its imports share the
// test file's module registry. A write to a Case or the Graph schedules a detached Export write
// whose reads outlive the test; the next test's `resetTestDb` (TRUNCATE, an ACCESS EXCLUSIVE lock
// on every table taken one by one) deadlocks against them (#379). Wait for them after every test,
// so a reset never overlaps one. The import is lazy: a file that never schedules an export loads
// the module empty and returns at once.
afterEach(async () => {
  const [{ exportWritesSettledEffect }, { runDomain }] = await Promise.all([
    import("../../packages/core/src/export/index"),
    import("../../packages/core/src/infra/index"),
  ]);
  await runDomain(exportWritesSettledEffect);
});
