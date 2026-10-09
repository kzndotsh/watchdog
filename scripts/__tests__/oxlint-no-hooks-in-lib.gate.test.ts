/**
 * Proves the real `oxlint.config.ts` bans hook definitions in `lib/` folders under
 * `apps/web/src` (`watchdog/no-hooks-in-lib`). The fixture starts with no baseline, so
 * every definition reports. Probe files are written into a throwaway repo that carries
 * the real config and plugin (helpers/oxlint-fixture.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const RULE = "watchdog/no-hooks-in-lib";
const SRC = "apps/web/src";
const DOMAIN_LIB = `${SRC}/domains/cases/lib`;

const createFixture = oxlintFixtureFactory();

let result: LintResult;

const FAIL = {
  "exported-fn.ts": "export function useThing() { return 1; }\n",
  "local-fn.ts":
    "function useThing() { return 1; }\nexport const x = useThing;\n",
  "async-fn.ts": "export async function useThing() { return 1; }\n",
  "arrow.ts": "export const useThing = () => 1;\n",
  "local-arrow.ts": "const useThing = () => 1;\nexport const x = useThing;\n",
  "fn-expression.ts": "export const useThing = function () { return 1; };\n",
  "default-fn.ts": "export default function useThing() { return 1; }\n",
  "digit.ts": "export function use2Things() { return 1; }\n",
  "nested-folder/deep.ts": "export const useDeep = () => 1;\n",
  "nested-in-fn.ts":
    "export function build() { const useInner = () => 1; return useInner; }\n",
} as const;

const OK = {
  "plain.ts": "export function helper() { return 1; }\n",
  "user.ts":
    "export const user = () => 1;\nexport function username() { return 1; }\nexport const useless = () => 1;\n",
  "bare-use.ts": "export const use = () => 1;\n",
  "not-a-function.ts": "export const useThing = 5;\n",
  "call-site.ts":
    'import { useMemo } from "react";\nexport const x = () => useMemo(() => 1, []);\n',
} as const;

beforeAll(() => {
  const fixture = createFixture();

  for (const [name, source] of Object.entries(FAIL)) {
    fixture.write(`${DOMAIN_LIB}/${name}`, source);
  }
  for (const [name, source] of Object.entries(OK)) {
    fixture.write(`${DOMAIN_LIB}/${name}`, source);
  }
  fixture.write(`${SRC}/shared/lib/hook.ts`, FAIL["exported-fn.ts"]);
  fixture.write(`${SRC}/lib/hook.ts`, FAIL["exported-fn.ts"]);
  fixture.write(`${SRC}/domains/cases/lib/sub/dir/hook.tsx`, FAIL["arrow.ts"]);

  fixture.write(`${SRC}/domains/cases/hooks/use-thing.ts`, FAIL["arrow.ts"]);
  fixture.write(`${SRC}/shared/hooks/use-thing.ts`, FAIL["arrow.ts"]);
  fixture.write(
    `${SRC}/domains/cases/components/use-thing.ts`,
    FAIL["arrow.ts"]
  );
  fixture.write(`${SRC}/domains/cases/library/hook.ts`, FAIL["arrow.ts"]);
  fixture.write(
    `${SRC}/domains/cases/components/lib-hook.ts`,
    FAIL["arrow.ts"]
  );
  fixture.write(`${SRC}/domains/cases/lib.ts`, FAIL["arrow.ts"]);
  fixture.write(`${DOMAIN_LIB}/__tests__/helper.test.ts`, FAIL["arrow.ts"]);
  fixture.write(`${SRC}/shared/lib/__tests__/helper.ts`, FAIL["arrow.ts"]);
  fixture.write(`${DOMAIN_LIB}/with.test.ts`, FAIL["arrow.ts"]);
  fixture.write("packages/core/src/lib/hook.ts", FAIL["arrow.ts"]);
  fixture.write("apps/web/e2e/lib/hook.ts", FAIL["arrow.ts"]);

  result = fixture.lint([SRC, "packages", "apps/web/e2e"]);
}, LINT_TIMEOUT_MS);

const hits = (file: string) => findingsFor(result, file, RULE);

describe("no hooks in lib/ (no-hooks-in-lib)", () => {
  it.each(Object.keys(FAIL))("rejects %s", (name) => {
    expect(hits(`${DOMAIN_LIB}/${name}`)).toHaveLength(1);
  });

  it("rejects shared/lib, the root lib and nested lib folders", () => {
    expect(hits(`${SRC}/shared/lib/hook.ts`)).toHaveLength(1);
    expect(hits(`${SRC}/lib/hook.ts`)).toHaveLength(1);
    expect(hits(`${SRC}/domains/cases/lib/sub/dir/hook.tsx`)).toHaveLength(1);
  });

  it("names the hook, the fix and the convention, on the right line", () => {
    const [hit] = hits(`${DOMAIN_LIB}/exported-fn.ts`);
    expect(hit?.message).toContain("useThing");
    expect(hit?.message).toContain("hooks/");
    expect(hit?.message).toContain(
      "conventions: lib/ holds pure helpers, hooks live in hooks/"
    );
    expect(hit?.line).toBe(1);
  });

  it.each(Object.keys(OK))("allows %s", (name) => {
    expect(hits(`${DOMAIN_LIB}/${name}`)).toHaveLength(0);
  });

  it("allows hooks in hooks/ and components/, and look-alike folder names", () => {
    expect(hits(`${SRC}/domains/cases/hooks/use-thing.ts`)).toHaveLength(0);
    expect(hits(`${SRC}/shared/hooks/use-thing.ts`)).toHaveLength(0);
    expect(hits(`${SRC}/domains/cases/components/use-thing.ts`)).toHaveLength(
      0
    );
    expect(hits(`${SRC}/domains/cases/library/hook.ts`)).toHaveLength(0);
    expect(hits(`${SRC}/domains/cases/components/lib-hook.ts`)).toHaveLength(0);
    expect(hits(`${SRC}/domains/cases/lib.ts`)).toHaveLength(0);
  });

  it("exempts tests and trees outside apps/web/src", () => {
    expect(hits(`${DOMAIN_LIB}/__tests__/helper.test.ts`)).toHaveLength(0);
    expect(hits(`${SRC}/shared/lib/__tests__/helper.ts`)).toHaveLength(0);
    expect(hits(`${DOMAIN_LIB}/with.test.ts`)).toHaveLength(0);
    expect(hits("packages/core/src/lib/hook.ts")).toHaveLength(0);
    expect(hits("apps/web/e2e/lib/hook.ts")).toHaveLength(0);
  });
});
