/**
 * Proves the real `oxlint.config.ts` enforces the packages/db repo contract (the rules the
 * retired `check-repo-rules.mjs` line-regex gate enforced) on `packages/db/src/repos/*.repo.ts`
 * only: no throw, no transaction, no NOTIFY, no `.toISOString()`, no `SQL` types, leading
 * `exec: DbExec`, no `trimmedOrNull`, `trimmedOrUndefined` only in lookup methods, no job
 * status set literal, no raw `sql` fragment, no validation import. Each shape the old script
 * reported is a must-fail case; the `regex-wrong` cases are ones the regexes got wrong.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { findingsFor, oxlintFixtureFactory } from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const DIR = "packages/db/src/repos";
const rule = (id: string) => `watchdog/${id}`;

/** A repo file whose methods are `methods`; the object is named like the real ones. */
const repo = (...methods: string[]) =>
  `export const thingRepo = {\n${methods.join("\n")}\n};\n`;
const ok = "  async get(exec: DbExec) {\n    return exec.select();\n  },";

interface Case {
  readonly rule: string;
  readonly name: string;
  readonly src: string;
  /** 1-based lines of the expected findings. */
  readonly lines: readonly number[];
}

/** Violations: every shape the old script reported, plus regex misses. */
const FAIL: readonly Case[] = [
  {
    rule: "db-repo-no-throw",
    name: "throw-new",
    src: repo(
      "  async get(exec: DbExec) {",
      "    throw new Error('nope');",
      "  },"
    ),
    lines: [3],
  },
  {
    // regex-wrong: `throw new` was required, so a bare rethrow slipped through
    rule: "db-repo-no-throw",
    name: "regex-wrong-throw-rethrow",
    src: repo(
      "  async get(exec: DbExec) {",
      "    try { return await exec.select(); } catch (e) { throw e; }",
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-no-transaction",
    name: "transaction",
    src: repo(
      "  async get(exec: DbExec) {",
      "    return exec.transaction(async () => null);",
      "  },"
    ),
    lines: [3],
  },
  {
    // regex-wrong: `.transaction` and `(` on different lines
    rule: "db-repo-no-transaction",
    name: "regex-wrong-transaction-split",
    src: repo(
      "  async get(exec: DbExec) {",
      "    return exec",
      "      .transaction",
      "      (async () => null);",
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-no-transaction",
    name: "transact-helper",
    src: repo(
      "  async get(exec: DbExec) {",
      "    return transact(exec, async () => null);",
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-no-notify",
    name: "pg-notify-in-sql",
    src: repo(
      "  async get(exec: DbExec) {",
      "    return exec.execute(sql`select pg_notify('c', 'x')`);",
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-no-notify",
    name: "dot-notify",
    src: repo(
      "  async get(exec: DbExec) {",
      "    return exec.notify('c', 'x');",
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-no-dto-date",
    name: "to-iso-string",
    src: repo(
      "  async get(exec: DbExec, at: Date) {",
      "    return at.toISOString();",
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-no-dto-date",
    name: "to-iso-string-optional",
    src: repo(
      "  async get(exec: DbExec, at: Date | null) {",
      "    return at?.toISOString();",
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-no-sql-param",
    name: "sql-param",
    src: repo(
      "  async get(exec: DbExec, where: SQL) {",
      "    return exec.select().where(where);",
      "  },"
    ),
    lines: [2],
  },
  {
    rule: "db-repo-no-sql-param",
    name: "sql-generic-param",
    src: repo(
      "  async get(exec: DbExec, where: SQL<unknown>) {",
      "    return exec.select().where(where);",
      "  },"
    ),
    lines: [2],
  },
  {
    // regex-wrong: only `: SQL` was matched; wrapper types hid it
    rule: "db-repo-no-sql-param",
    name: "regex-wrong-sql-in-array",
    src: repo(
      "  async get(exec: DbExec, where: Array<SQL>) {",
      "    return exec.select().where(and(...where));",
      "  },"
    ),
    lines: [2],
  },
  {
    rule: "db-repo-exec-first",
    name: "exec-missing",
    src: repo("  async get(id: string) {", "    return null;", "  },"),
    lines: [2],
  },
  {
    rule: "db-repo-exec-first",
    name: "exec-second",
    src: repo(
      "  async get(id: string, exec: DbExec) {",
      "    return exec.select();",
      "  },"
    ),
    lines: [2],
  },
  {
    rule: "db-repo-exec-first",
    name: "exec-wrapped-params",
    src: repo(
      "  async get(",
      "    id: string,",
      "    exec: DbExec",
      "  ) {",
      "    return exec.select();",
      "  },"
    ),
    lines: [2],
  },
  {
    // regex-wrong: only `  async name(` at two-space indent was checked
    rule: "db-repo-exec-first",
    name: "regex-wrong-sync-method",
    src: repo("  get(id: string) {", "    return null;", "  },"),
    lines: [2],
  },
  {
    rule: "db-repo-exec-first",
    name: "regex-wrong-arrow-property",
    src: repo("  get: async (id: string) => null,"),
    lines: [2],
  },
  {
    rule: "db-repo-exec-first",
    name: "exec-wrong-type",
    src: repo("  async get(exec: unknown) {", "    return null;", "  },"),
    lines: [2],
  },
  {
    rule: "db-repo-exec-first",
    name: "exec-optional",
    src: repo("  async get(exec?: DbExec) {", "    return null;", "  },"),
    lines: [2],
  },
  {
    rule: "db-repo-exec-first",
    name: "exec-defaulted",
    src: repo("  async get(exec: DbExec = db) {", "    return null;", "  },"),
    lines: [2],
  },
  {
    rule: "db-repo-exec-first",
    name: "exec-destructured",
    src: repo(
      "  async get({ exec }: { exec: DbExec }) {",
      "    return null;",
      "  },"
    ),
    lines: [2],
  },
  {
    rule: "db-repo-exec-first",
    name: "exec-rest",
    src: repo("  async get(...exec: DbExec[]) {", "    return null;", "  },"),
    lines: [2],
  },
  {
    rule: "db-repo-no-transaction",
    name: "transaction-template-key",
    src: repo(
      "  async get(exec: DbExec) {",
      "    return exec[`transaction`](async () => null);",
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-no-notify",
    name: "pg-notify-uppercase",
    src: repo(
      "  async get(exec: DbExec) {",
      "    return exec.execute(sql`select PG_NOTIFY('c', 'x')`);",
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-no-sql-param",
    name: "sql-aliased-import",
    src: `import type { SQL as Fragment } from "drizzle-orm";\n\n${repo(
      "  async get(exec: DbExec, where: Fragment) {",
      "    return exec.select().where(where);",
      "  },"
    )}`,
    lines: [4],
  },
  {
    rule: "db-repo-no-trim-or-null",
    name: "trim-or-null-qualified",
    src: repo(
      "  async create(exec: DbExec, name: string) {",
      "    return shared.trimmedOrNull(name);",
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-trim-lookup-only",
    name: "trim-or-undefined-qualified",
    src: repo(
      "  async rename(exec: DbExec, name: string) {",
      "    return shared.trimmedOrUndefined(name);",
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-no-validation-import",
    name: "zod-dynamic-import",
    src: repo(
      "  async get(exec: DbExec) {",
      '    return import("zod");',
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-no-validation-import",
    name: "zod-reexport",
    src: `export { z } from "zod";\n\n${repo(ok)}`,
    lines: [1],
  },
  {
    rule: "db-repo-no-trim-or-null",
    name: "trim-or-null",
    src: repo(
      "  async create(exec: DbExec, name: string) {",
      "    return trimmedOrNull(name);",
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-no-trim-or-null",
    name: "trim-or-null-in-lookup-method",
    src: repo(
      "  async getIdByName(exec: DbExec, name: string) {",
      "    return trimmedOrNull(name);",
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-trim-lookup-only",
    name: "trim-or-undefined-outside-lookup",
    src: repo(
      "  async rename(exec: DbExec, name: string) {",
      "    return trimmedOrUndefined(name);",
      "  },"
    ),
    lines: [3],
  },
  {
    // regex-wrong: the "current method" stuck on the last `async x(`, so a helper after
    // an allowed method was attributed to it
    rule: "db-repo-trim-lookup-only",
    name: "regex-wrong-trim-in-helper-after-allowed-method",
    src: `export const thingRepo = {\n  async getIdByName(exec: DbExec, n: string) {\n    return trimmedOrUndefined(n);\n  },\n};\n\nfunction helper(n: string) {\n  return trimmedOrUndefined(n);\n}\n`,
    lines: [8],
  },
  {
    rule: "db-repo-no-job-status-set",
    name: "status-set",
    src: repo(
      "  async open(exec: DbExec) {",
      '    return inArray(jobs.status, ["queued", "running"]);',
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-no-job-status-set",
    name: "status-set-backticks",
    src: repo(
      "  async open(exec: DbExec) {",
      "    return inArray(jobs.status, [`queued`, `running`]);",
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-no-job-status-set",
    name: "status-set-nested-bracket",
    src: repo(
      "  async open(exec: DbExec, x: string[]) {",
      '    return inArray(jobs.status, [x[0], "queued", "running"]);',
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-no-job-status-set",
    name: "status-set-new-set",
    src: repo(
      "  async open(exec: DbExec) {",
      '    return new Set(["queued", "running"]);',
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-no-job-status-set",
    name: "status-set-after-url-string",
    src: repo(
      "  async open(exec: DbExec) {",
      '    return inArray(jobs.url, ["http://a", "queued", "running"]);',
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-no-raw-sql",
    name: "raw-sql",
    src: repo(
      "  async get(exec: DbExec) {",
      "    return exec.select().where(sql`now() > created_at`);",
      "  },"
    ),
    lines: [3],
  },
  {
    rule: "db-repo-no-validation-import",
    name: "zod-import",
    src: `import { z } from "zod";\n\n${repo(ok)}export const s = z.string();\n`,
    lines: [1],
  },
  {
    rule: "db-repo-no-validation-import",
    name: "zod-subpath-import",
    src: `import { z } from "zod/v4";\n\n${repo(ok)}export const s = z.string();\n`,
    lines: [1],
  },
];

/** Near misses: legal code the regexes flagged or that sits beside a violation. */
const PASS: readonly { readonly name: string; readonly src: string }[] = [
  {
    name: "clean-repo",
    src: repo(
      "  async get(exec: DbExec, id: string) {",
      "    return exec.select().from(things).where(eq(things.id, id));",
      "  },"
    ),
  },
  {
    name: "arrow-with-exec",
    src: repo("  get: async (exec: DbExec) => exec.select(),"),
  },
  {
    // regex-wrong: comments (also trailing ones) tripped the line regexes
    name: "regex-wrong-comment-throw-transaction",
    src: repo(
      "  async get(exec: DbExec) {",
      "    // throw new Error('x'); exec.transaction(fn); at.toISOString()",
      "    return exec.select(); // was exec.transaction(() => 1)",
      "  },"
    ),
  },
  {
    // regex-wrong: a string holding `throw new` is not a throw
    name: "regex-wrong-string-throw",
    src: repo(
      "  async get(exec: DbExec) {",
      '    return exec.select().where(eq(t.msg, "throw new Error()"));',
      "  },"
    ),
  },
  {
    name: "status-in-comments",
    src: repo(
      '  /** open = ["queued", "running"] */',
      "  async open(exec: DbExec) {",
      '    /* ["queued", "running"] */',
      '    return exec.select(); // was inArray(status, ["queued", "running"])',
      "  },"
    ),
  },
  {
    name: "single-status-and-vocabulary",
    src: repo(
      "  async open(exec: DbExec) {",
      '    exec.update(jobs).set({ status: "cancelled" });',
      "    return inArray(jobs.status, [...OPEN_JOB_STATUSES]);",
      "  },",
      '  async other(exec: DbExec) { return ["queued", "unrelated"]; },'
    ),
  },
  {
    name: "status-comparison-chain",
    src: repo(
      "  async open(exec: DbExec, status: string) {",
      '    return status === "queued" || status === "running";',
      "  },"
    ),
  },
  {
    name: "trim-or-undefined-in-lookup-methods",
    src: repo(
      "  async getIdByName(exec: DbExec, n: string) {",
      "    return trimmedOrUndefined(n);",
      "  },",
      "  async upsert(exec: DbExec, n: string) {",
      "    const scoped = trimmedOrUndefined(n);",
      "    return [1].map(() => trimmedOrUndefined(n) ?? scoped);",
      "  },"
    ),
  },
  {
    name: "non-function-properties",
    src: repo("  limit: 10,", ok),
  },
  {
    name: "non-repo-object-is-not-a-method-set",
    src: "export const thingColumns = {\n  id: (id: string) => id,\n};\n",
  },
  {
    name: "schemas-shared-import",
    src: `import { trimmedOrUndefined } from "@watchdog/schemas/shared";\n\n${repo(ok)}`,
  },
];

const createFixture = oxlintFixtureFactory();

let result: LintResult;

beforeAll(() => {
  const fixture = createFixture();
  for (const c of FAIL) fixture.write(`${DIR}/${c.name}.repo.ts`, c.src);
  for (const c of PASS) fixture.write(`${DIR}/${c.name}.repo.ts`, c.src);

  // Out of scope: helper modules, tests, and repos in other packages.
  const violating = FAIL.find((c) => c.name === "throw-new")?.src ?? "";
  fixture.write(`${DIR}/_helper.ts`, violating);
  fixture.write(`${DIR}/__tests__/thing.repo.test.ts`, violating);
  fixture.write("packages/core/src/thing.repo.ts", violating);
  result = fixture.lint([DIR, "packages/core/src"]);
});

const hits = (name: string, id: string) =>
  findingsFor(result, `${DIR}/${name}.repo.ts`, rule(id));

describe("db repo rules (oxlint.config.ts)", () => {
  it.each(FAIL.map((c) => [c.rule, c.name, c] as const))(
    "%s rejects %s",
    (_id, _name, c) => {
      expect(hits(c.name, c.rule).map((f) => f.line)).toEqual([...c.lines]);
    }
  );

  it.each(PASS.map((c) => [c.name] as const))("allows %s", (name) => {
    const found = result.findings.filter(
      (f) =>
        f.file.endsWith(`${DIR}/${name}.repo.ts`) &&
        f.rule.startsWith("watchdog/db-repo-")
    );
    expect(found).toEqual([]);
  });

  it("reports a violation under its own rule only", () => {
    const stray = result.findings.filter(
      (f) =>
        f.rule.startsWith("watchdog/db-repo-") &&
        f.file.endsWith("exec-missing.repo.ts") &&
        f.rule !== rule("db-repo-exec-first")
    );
    expect(stray).toEqual([]);
  });

  it("does not apply to helpers, tests or other packages", () => {
    const out = result.findings.filter(
      (f) =>
        f.rule.startsWith("watchdog/db-repo-") &&
        (f.file.endsWith("_helper.ts") ||
          f.file.includes("__tests__") ||
          f.file.includes("packages/core"))
    );
    expect(out).toEqual([]);
  });

  it("states the fix and where the rule lives", () => {
    const [hit] = hits("throw-new", "db-repo-no-throw");
    expect(hit?.message).toContain("return null");
    expect(hit?.message).toContain("packages/db/AGENTS.md");
    const [status] = hits("status-set", "db-repo-no-job-status-set");
    expect(status?.message).toContain("OPEN_JOB_STATUSES");
  });
});
