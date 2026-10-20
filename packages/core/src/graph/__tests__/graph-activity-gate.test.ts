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

/** Every `xRepo.writeMethod` a file names, called or passed along. */
function graphRepoWrites(
  source: string,
  writeMethods: Map<string, Set<string>>
): string[] {
  const repoNames = [...writeMethods.keys()].join("|");
  const reference = new RegExp(`\\b(${repoNames})\\.(\\w+)\\b`, "g");
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
    if (["__tests__", "testing", "node_modules"].includes(entry.name)) continue;
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
