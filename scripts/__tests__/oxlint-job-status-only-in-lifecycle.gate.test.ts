/**
 * Proves the real `oxlint.config.ts` keeps Job status writes inside the lifecycle module
 * (`packages/core/src/jobs/lifecycle/`): `jobsRepo.settle` is called only from there,
 * `jobs-settle.repo.ts` is the one db file that sets `jobs.status`, and an insert may only
 * admit a `queued` Job. Tests, test-db and files outside `src` (the demo seed) are exempt.
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const RULE = "watchdog/job-status-only-in-lifecycle";

const SETTLE_CALL =
  "export const a = (exec: unknown) => jobsRepo.settle(exec, c, j, { status: 'failed' }, ['running']);\n";
const UPDATE_STATUS =
  "export const a = (exec: any) => exec.update(jobs).set({ status: 'cancelled' }).where(w);\n";
const WRAPPED_STATUS =
  "export const a = (exec: any) => exec.update(jobs).set(setOrTouch({ ...c, status })).where(w);\n";
const INSERT_RUNNING =
  "export const a = (exec: any) => exec.insert(jobs).values({ status: 'running' });\n";

const FAIL: Readonly<Record<string, string>> = {
  "packages/core/src/jobs/outside-settle.ts": SETTLE_CALL,
  "packages/core/src/jobs/outside-update.ts": UPDATE_STATUS,
  "packages/db/src/repos/jobs.repo.ts": UPDATE_STATUS,
  "packages/db/src/repos/wrapped.repo.ts": WRAPPED_STATUS,
  "packages/db/src/repos/insert-running.repo.ts": INSERT_RUNNING,
  "apps/worker/src/settle.ts": SETTLE_CALL,
};

const PASS: Readonly<Record<string, string>> = {
  // The module itself and the one db writer.
  "packages/core/src/jobs/lifecycle/settle.ts": SETTLE_CALL,
  "packages/db/src/repos/jobs-settle.repo.ts": UPDATE_STATUS,
  // Tests, test-db and seeds outside `src`.
  "packages/core/src/jobs/__tests__/seed.test.ts": UPDATE_STATUS,
  "packages/test-db/src/db/seed/job.ts": UPDATE_STATUS,
  "packages/db/scripts/demo-seed/write.ts": UPDATE_STATUS,
  // Admission, and writes that do not touch status.
  "packages/db/src/repos/insert-queued.repo.ts":
    "export const a = (exec: any) => exec.insert(jobs).values({ status: 'queued' });\n",
  "packages/db/src/repos/update-logs.repo.ts":
    "export const a = (exec: any) => exec.update(jobs).set({ logs: [] }).where(w);\n",
  "packages/db/src/repos/other-table.repo.ts":
    "export const a = (exec: any) => exec.update(playbookRuns).set({ status: 'cancelled' }).where(w);\n",
  "packages/core/src/jobs/settle-job-effect.ts":
    "export const a = settleJobEffect(c, j, { status: 'failed' });\n",
};

const createFixture = oxlintFixtureFactory();

let result: LintResult;

beforeAll(() => {
  const fixture = createFixture();
  for (const [file, src] of Object.entries({ ...FAIL, ...PASS })) {
    fixture.write(file, src);
  }
  result = fixture.lint(Object.keys({ ...FAIL, ...PASS }));
}, LINT_TIMEOUT_MS);

describe("Job status writes only in the lifecycle module (oxlint.config.ts)", () => {
  it.each(Object.keys(FAIL))("rejects %s", (file) => {
    const [hit] = findingsFor(result, file, RULE);
    expect(hit?.message).toContain("lifecycle module");
  });

  it.each(Object.keys(PASS))("allows %s", (file) => {
    expect(findingsFor(result, file, RULE)).toHaveLength(0);
  });
});
