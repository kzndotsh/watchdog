import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isActivityActionForKind } from "@watchdog/schemas/feed";

import { GRAPH_MUTATIONS } from "./graph-mutations";

/**
 * The ADR-0005 gate, as the Graph mutation module (#418) leaves it: the module's writer
 * appends the activity entry and sets the history context for every write, so the rule that
 * no Graph write forgets either is "no Graph repo write is called except from the module".
 * This test scans production source for a call to (or a reference to) a write method of the six
 * Graph repos (entities, claims, identifiers, edges, events, questions) and fails on any
 * outside `graph/mutation/tables.ts` and the exemptions below. A new mutation therefore goes
 * through `runGraphMutation`, or adds an exemption a reviewer can check.
 * `graph-activity.int.test.ts` still runs every registered mutation and asserts its entry.
 */

const REPO_ROOT = path.join(import.meta.dirname, "..", "..", "..", "..", "..");
const REPOS_DIR = path.join(REPO_ROOT, "packages", "db", "src", "repos");
const GRAPH_REPOS = [
  "entities",
  "claims",
  "identifiers",
  "edges",
  "events",
  "questions",
] as const;
/** Repo methods that only read (or lock); anything else on a Graph repo writes. */
const READ_METHOD = /^(get|list|find|search|lock|next)(?!OrCreate)/;

/** The module's repo adapters: the one file that calls Graph repo writes on the module's behalf. */
const MODULE_FILE = "packages/core/src/graph/mutation/tables.ts";

/** Where Graph repos are written outside the module, each with the reason a reviewer can check. */
const EXEMPT_PATHS: Readonly<Record<string, string>> = {
  "packages/db/src/repos/":
    "the repos themselves, and the writes they make into one another",
  "packages/test-db/": "test seeds build rows without the module on purpose",
  "packages/db/scripts/demo-seed/":
    "the screenshot seed writes a finished demo Graph, with no actor to attribute",
};
/** Single calls allowed in one file; any other Graph repo write in it still fails. */
const EXEMPT_CALLS: Readonly<
  Record<string, { calls: readonly string[]; reason: string }>
> = {
  "packages/core/src/graph/questions.ts": {
    calls: ["questionsRepo.create"],
    reason:
      "seedDefaultQuestionsEffect appends no entry by design: the Entity's `created` entry stands for its default Questions (a `w.insert` would add one entry each)",
  },
};

type SourceFile = { path: string; source: string };

/** `repo.method` for every write method of every Graph repo, from the repos' own source. */
function repoWriteMethods(): Map<string, Set<string>> {
  const byRepo = new Map<string, Set<string>>();
  for (const name of GRAPH_REPOS) {
    const source = readFileSync(
      path.join(REPOS_DIR, `${name}.repo.ts`),
      "utf-8"
    );
    const methods = new Set<string>();
    for (const match of source.matchAll(/^ {2}(?:async )?(\w+)\(/gm)) {
      const method = match[1];
      if (method !== undefined && !READ_METHOD.test(method)) {
        methods.add(method);
      }
    }
    byRepo.set(`${name}Repo`, methods);
  }
  return byRepo;
}

function withoutComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/\/\/.*$/gm, "");
}

/**
 * Every `xRepo.writeMethod` a file names, called or passed along, through the repo itself or
 * its Effect module (`xRepoFx`, `xRepoFxDb`), which makes the same write.
 */
function graphRepoWrites(
  source: string,
  writeMethods: Map<string, Set<string>>
): string[] {
  const repoNames = [...writeMethods.keys()].join("|");
  const reference = new RegExp(
    `\\b(${repoNames})(?:FxDb|Fx)?\\s*\\.(\\w+)\\b`,
    "g"
  );
  const writes: string[] = [];
  for (const match of withoutComments(source).matchAll(reference)) {
    const [, repo, method] = match;
    if (
      repo !== undefined &&
      method !== undefined &&
      writeMethods.get(repo)?.has(method) === true
    ) {
      writes.push(`${repo}.${method}`);
    }
  }
  return writes;
}

/** `file: repo.method` for each Graph repo write outside the module and the exemptions. */
function violations(
  files: readonly SourceFile[],
  writeMethods: Map<string, Set<string>>
): string[] {
  const found: string[] = [];
  for (const file of files) {
    if (file.path === MODULE_FILE) continue;
    if (
      Object.keys(EXEMPT_PATHS).some((prefix) => file.path.startsWith(prefix))
    ) {
      continue;
    }
    const allowed = EXEMPT_CALLS[file.path]?.calls ?? [];
    for (const write of graphRepoWrites(file.source, writeMethods)) {
      if (!allowed.includes(write)) found.push(`${file.path}: ${write}`);
    }
  }
  return found;
}

/** Production source: no tests, test helpers or dependencies. */
function productionFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (["__tests__", "node_modules"].includes(entry.name)) continue;
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...productionFiles(entryPath));
    else if (
      /\.(?:ts|tsx|mjs)$/.test(entry.name) &&
      !/\.(?:d|test|spec)\.\w+$/.test(entry.name)
    ) {
      files.push(entryPath);
    }
  }
  return files;
}

function repoSource(): SourceFile[] {
  const roots = ["packages", "apps"].flatMap((group) =>
    readdirSync(path.join(REPO_ROOT, group)).flatMap((name) => [
      path.join(REPO_ROOT, group, name, "src"),
      path.join(REPO_ROOT, group, name, "scripts"),
    ])
  );
  return roots
    .filter((dir) => {
      try {
        readdirSync(dir);
        return true;
      } catch {
        return false;
      }
    })
    .flatMap((dir) => productionFiles(dir))
    .map((file) => ({
      path: path.relative(REPO_ROOT, file).split(path.sep).join("/"),
      source: readFileSync(file, "utf-8"),
    }));
}

const writeMethods = repoWriteMethods();

describe("Graph repo write gate (#418)", () => {
  it("sees the write methods of all six Graph repos", () => {
    expect([...writeMethods.keys()].sort()).toEqual([
      "claimsRepo",
      "edgesRepo",
      "entitiesRepo",
      "eventsRepo",
      "identifiersRepo",
      "questionsRepo",
    ]);
    expect(writeMethods.get("entitiesRepo")).toContain("create");
    expect(writeMethods.get("claimsRepo")).toContain("retractInCase");
    expect(writeMethods.get("questionsRepo")).not.toContain("getInCase");
  });

  it("calls Graph repo writes only from the module, apart from the reasoned exemptions", () => {
    const files = repoSource();
    // Guards the scan itself: it must see the module's own writes and the exempted seed.
    const module = files.find((file) => file.path === MODULE_FILE);
    expect(
      graphRepoWrites(module?.source ?? "", writeMethods).length
    ).toBeGreaterThan(10);
    expect(files.some((file) => file.path in EXEMPT_CALLS)).toBe(true);
    expect(
      violations(files, writeMethods),
      "Write the Graph through runGraphMutation (graph/mutation), which appends the activity entry and the history context; or add an exemption with a reason"
    ).toEqual([]);
  });

  it("fails on a Graph repo write added outside the module", () => {
    const outside = (source: string, file = "packages/core/src/graph/new.ts") =>
      violations([{ path: file, source }], writeMethods);

    expect(outside("await edgesRepo.create(tx, values);")).toEqual([
      "packages/core/src/graph/new.ts: edgesRepo.create",
    ]);
    expect(outside("const write = claimsRepo.updateInCase;")).toEqual([
      "packages/core/src/graph/new.ts: claimsRepo.updateInCase",
    ]);
    expect(
      outside(
        "await entitiesRepo.deleteInCase(tx, caseId, id);",
        "apps/web/src/server/x.ts"
      )
    ).toHaveLength(1);
    // The Effect repo modules make the same write.
    expect(outside("yield* edgesRepoFx.create(tx, values);")).toEqual([
      "packages/core/src/graph/new.ts: edgesRepo.create",
    ]);
    expect(outside("yield* claimsRepoFxDb.retractInCase(c, id);")).toEqual([
      "packages/core/src/graph/new.ts: claimsRepo.retractInCase",
    ]);
  });

  it("lets the module, the exemptions, reads and comments through", () => {
    const check = (file: string, source: string) =>
      violations([{ path: file, source }], writeMethods);

    expect(check(MODULE_FILE, "eventsRepo.create(exec, values);")).toEqual([]);
    expect(
      check(
        "packages/core/src/graph/x.ts",
        "await edgesRepo.getInCase(tx, id);"
      )
    ).toEqual([]);
    expect(
      check(
        "packages/core/src/graph/x.ts",
        "// edgesRepo.create(tx) is banned\n/* identifiersRepo.update */"
      )
    ).toEqual([]);
    expect(
      check("packages/test-db/src/db/seed/x.ts", "entitiesRepo.create(tx, v);")
    ).toEqual([]);
    expect(
      check(
        "packages/db/scripts/demo-seed/write.ts",
        "claimsRepo.create(exec, v);"
      )
    ).toEqual([]);
    // The seed exemption covers its one call, not the rest of the file.
    expect(
      check(
        "packages/core/src/graph/questions.ts",
        "questionsRepo.create(tx, v);"
      )
    ).toEqual([]);
    expect(
      check(
        "packages/core/src/graph/questions.ts",
        "questionsRepo.deleteInCase(tx, c, id);"
      )
    ).toEqual([
      "packages/core/src/graph/questions.ts: questionsRepo.deleteInCase",
    ]);
  });

  it("states a reason for every exemption", () => {
    for (const [prefix, reason] of Object.entries(EXEMPT_PATHS)) {
      expect(reason.length, prefix).toBeGreaterThan(20);
    }
    for (const [file, { reason }] of Object.entries(EXEMPT_CALLS)) {
      expect(reason.length, file).toBeGreaterThan(20);
    }
  });
});

/**
 * Case and Task rows are not Graph rows (no module), but ADR-0005 still gives each of their
 * mutations an activity entry. Every top-level function in core that calls a write method of
 * `casesRepo` or `tasksRepo` must be a `sites` entry of a registered mutation (which
 * `graph-activity.int.test.ts` runs and counts) or be exempted with a reason.
 */
const CASE_TASK_REPOS = ["cases", "tasks"] as const;
const CASE_TASK_EXEMPTIONS: Readonly<Record<string, string>> = {
  "cases/cases.ts#createCaseEffect":
    "a new Case has no Graph and no `case.created` verb (ADR-0005 lists only `case.updated`); the Case list is not live",
  "cases/tombstone.ts#tombstoneInTx":
    "a Case delete is a tombstone (#304) that touches no Graph row; `recordDeletionEventEffect` writes the deletion record and the Case-level `deleted` activity entry in the same transaction, and the Jobs it cancels append their own entries",
  "cases/tombstone.ts#restoreCaseEffect":
    "a restore clears the tombstone and touches no Graph row; `recordDeletionEventEffect` writes the deletion record and the Case-level `restored` activity entry in the same transaction",
  "cases/purge.ts#purgeTombstonedCaseEffect":
    "a purge erases the whole Case, its activity entries with it (FK cascade); the permanent deletion record, written in the same transaction, is its trace",
  "cases/purge.ts#recordPurgeFailureEffect":
    "stores the last purge failure on the tombstoned Case row; not a Graph write",
};
/**
 * A top-level function or `const` (every top-level `const` is a boundary, so a writer bound
 * through `Effect.fn` or `Effect.gen` is attributed to itself, never to the previous function).
 */
const TOP_LEVEL_FUNCTION =
  /^(?:export )?(?:(?:async )?function\*? (\w+)|const (\w+)\b)/gm;

/** `file#function` of every top-level function whose body writes a Case or Task repo. */
function caseTaskWriters(files: readonly SourceFile[]): string[] {
  const methods = new Map<string, Set<string>>();
  for (const name of CASE_TASK_REPOS) {
    const source = readFileSync(
      path.join(REPOS_DIR, `${name}.repo.ts`),
      "utf-8"
    );
    const set = new Set<string>();
    for (const match of source.matchAll(/^ {2}(?:async )?(\w+)\(/gm)) {
      const method = match[1];
      if (method !== undefined && !READ_METHOD.test(method)) set.add(method);
    }
    methods.set(`${name}Repo`, set);
  }
  const writers: string[] = [];
  for (const file of files) {
    const source = withoutComments(file.source);
    const starts = [...source.matchAll(TOP_LEVEL_FUNCTION)];
    for (const [index, start] of starts.entries()) {
      const body = source.slice(
        start.index,
        starts[index + 1]?.index ?? source.length
      );
      const calls = [
        ...body.matchAll(/\b(cases|tasks)Repo(?:FxDb|Fx)?\s*\.(\w+)\(/g),
      ];
      if (
        calls.some(([, repo, method]) =>
          methods.get(`${repo}Repo`)?.has(method ?? "")
        )
      ) {
        writers.push(`${file.path}#${start[1] ?? start[2] ?? "?"}`);
      }
    }
  }
  return writers;
}

/** Writers that are neither a registered `sites` entry nor exempted. */
function unregisteredCaseTaskWriters(
  files: readonly SourceFile[],
  registered: ReadonlySet<string>
): string[] {
  return caseTaskWriters(files).filter(
    (site) => !registered.has(site) && !(site in CASE_TASK_EXEMPTIONS)
  );
}

describe("Case and Task repo write gate (ADR-0005 S4)", () => {
  const corePrefix = "packages/core/src/";
  const registered = new Set(GRAPH_MUTATIONS.flatMap((m) => m.sites ?? []));
  const coreFiles = () =>
    repoSource()
      .filter((file) => file.path.startsWith(corePrefix))
      .map((file) => ({ ...file, path: file.path.slice(corePrefix.length) }));

  it("registers every function that writes a Case or a Task", () => {
    const files = coreFiles();
    const writers = caseTaskWriters(files);
    expect(writers).toContain("tasks/tasks.ts#createTaskEffect");
    expect(writers).toContain("cases/cases.ts#updateCaseEffect");
    expect(
      unregisteredCaseTaskWriters(files, registered),
      "Register the mutation in graph/__tests__/graph-mutations.ts (`sites`, so it is run and its entry counted) and append to the activity log in its transaction, or add an exemption with a reason"
    ).toEqual([]);
  });

  it("names no function that no longer writes, and every exemption states a reason", () => {
    const writers = new Set(caseTaskWriters(coreFiles()));
    expect(
      [...registered, ...Object.keys(CASE_TASK_EXEMPTIONS)].filter(
        (site) => !writers.has(site)
      )
    ).toEqual([]);
    for (const [site, reason] of Object.entries(CASE_TASK_EXEMPTIONS)) {
      expect(reason.length, site).toBeGreaterThan(20);
    }
  });

  it("fails on an unregistered Task or Case write", () => {
    const fixture: SourceFile[] = [
      {
        path: "tasks/new-task.ts",
        source:
          "export const archiveTaskEffect = (id: string) => tasksRepo.removeInCase(tx, id);",
      },
      {
        path: "cases/new-case.ts",
        source:
          "export function renameCase() { return casesRepo.update(tx, id, v); }\nexport function readCase() { return casesRepo.getById(tx, id); }",
      },
    ];
    expect(unregisteredCaseTaskWriters(fixture, registered)).toEqual([
      "tasks/new-task.ts#archiveTaskEffect",
      "cases/new-case.ts#renameCase",
    ]);
    // A writer bound through Effect.fn is its own boundary, not part of the function before it.
    const bound: SourceFile[] = [
      {
        path: "tasks/bound.ts",
        source:
          "export function listTasks() { return tasksRepo.listForCase(tx, id); }\nexport const dropTaskEffect = Effect.fn(function* (id: string) {\n  yield* tryDb(() => tasksRepo.removeInCase(tx, id));\n});",
      },
    ];
    expect(unregisteredCaseTaskWriters(bound, registered)).toEqual([
      "tasks/bound.ts#dropTaskEffect",
    ]);
    // The Effect repo modules make the same write.
    const fx: SourceFile[] = [
      {
        path: "tasks/fx.ts",
        source:
          "export const dropTaskEffect = (id: string) => tasksRepoFx.removeInCase(tx, id);\nexport const dropTaskDbEffect = (id: string) => tasksRepoFxDb.removeInCase(id);\nexport const readTask = (id: string) => tasksRepoFx.getInCase(tx, c, id);",
      },
    ];
    expect(unregisteredCaseTaskWriters(fx, registered)).toEqual([
      "tasks/fx.ts#dropTaskEffect",
      "tasks/fx.ts#dropTaskDbEffect",
    ]);
  });
});

describe("Graph mutation registry", () => {
  it("lists unique names and verbs the activity vocabulary has", () => {
    const names = GRAPH_MUTATIONS.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    for (const mutation of GRAPH_MUTATIONS) {
      expect(
        isActivityActionForKind(mutation.kind, mutation.action),
        `${mutation.name}: ${mutation.kind}.${mutation.action}`
      ).toBe(true);
    }
  });
});
