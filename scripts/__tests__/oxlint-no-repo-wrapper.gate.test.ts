/**
 * Proves the real `oxlint.config.ts` keeps hand wrappers off repo calls in core
 * (`packages/core/src`): `tryDb(() => xRepo.m(...))` and `tryDbWith((exec) => xRepo.m(exec,
 * ...))` are errors, since `xRepoFx` / `xRepoFxDb` (`infra/repos-fx.ts`) are that seam. A
 * wrapper that passes `opts` (the conflict mapping) is allowed, as are non-repo calls and
 * tests.
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const RULE = "watchdog/no-repo-wrapper";

const TRY_DB =
  "export const a = (tx: unknown) => tryDb(() => casesRepo.getById(tx, id));\n";
const TRY_DB_WITH =
  "export const a = tryDbWith((exec) => casesRepo.list(exec, organizationId));\n";
const TRY_DB_BLOCK =
  "export const a = (tx: unknown) => tryDb(() => { return casesRepo.getById(tx, id); });\n";
const TRY_DB_PIPED =
  "export const a = (tx: unknown) => tryDb(() => tasksRepo.create(tx, row)).pipe(requireWritten('create Task'));\n";

const FAIL: Readonly<Record<string, string>> = {
  "packages/core/src/cases/direct.ts": TRY_DB,
  "packages/core/src/cases/with-db.ts": TRY_DB_WITH,
  "packages/core/src/cases/block-body.ts": TRY_DB_BLOCK,
  "packages/core/src/tasks/piped.ts": TRY_DB_PIPED,
};

const PASS: Readonly<Record<string, string>> = {
  // `opts` selects the conflict mapping, which needs the raw driver error.
  "packages/core/src/cases/with-opts.ts":
    "export const a = (tx: unknown) => tryDb(() => casesRepo.create(tx, row), { uniqueIndex: 'cases_slug_uidx' });\n",
  "packages/core/src/cases/with-db-opts.ts":
    "export const a = tryDbWith((exec) => casesRepo.create(exec, row), { uniqueIndex: 'cases_slug_uidx', conflictReason: 'taken' });\n",
  // Not a repo call.
  "packages/core/src/graph/non-repo.ts":
    "export const a = (tx: unknown) => tryDb(() => setGraphHistoryContext(tx, ctx));\n",
  "packages/core/src/jobs/auth-helper.ts":
    "export const a = tryDbWith((exec) => isUserBanned(exec, userId, now));\n",
  "packages/core/src/graph/descriptor.ts":
    "export const a = (tx: unknown) => tryDb(() => table.repo.get(tx, caseId, id));\n",
  "packages/core/src/jobs/two-calls.ts":
    "export const a = (tx: unknown) => tryDb(async () => { await casesRepo.lock(tx, id); return casesRepo.get(tx, id); });\n",
  // The Effect repo modules themselves.
  "packages/core/src/cases/fx.ts":
    "export const a = (tx: unknown) => casesRepoFx.getById(tx, id);\n",
  // Tests are exempt, and so is code outside core.
  "packages/core/src/cases/__tests__/direct.test.ts": TRY_DB,
  "packages/core/src/cases/direct.int.test.ts": TRY_DB_WITH,
  "packages/api/src/direct.ts": TRY_DB,
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

describe("no hand wrapper around a repo call in core (oxlint.config.ts)", () => {
  it.each(Object.keys(FAIL))("rejects %s", (file) => {
    const [hit] = findingsFor(result, file, RULE);
    expect(hit?.message).toContain("xRepoFx");
    // The message names the allowed form.
    expect(hit?.message).toContain("`opts`");
  });

  it.each(Object.keys(PASS))("allows %s", (file) => {
    expect(findingsFor(result, file, RULE)).toHaveLength(0);
  });
});
