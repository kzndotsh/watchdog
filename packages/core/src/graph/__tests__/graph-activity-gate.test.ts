import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isActivityActionForKind } from "@watchdog/schemas/feed";

import {
  GRAPH_MUTATION_EXEMPTIONS,
  GRAPH_MUTATION_HELPERS,
  GRAPH_MUTATIONS,
} from "./graph-mutations";

/**
 * The ADR-0005 gate: a Graph or Case mutation that forgets to append to the
 * activity log fails the build. It scans core's production source for every
 * function that calls a Graph repo write, then requires the function to be a
 * registered mutation (`GRAPH_MUTATIONS`, which the integration test runs and
 * counts) or a documented exemption, and to append inside its transaction.
 */

const CORE_SRC = path.join(import.meta.dirname, "..", "..");
const REPOS_DIR = path.join(CORE_SRC, "..", "..", "db", "src", "repos");
const GRAPH_REPOS = [
  "entities",
  "edges",
  "claims",
  "identifiers",
  "events",
  "questions",
  "cases",
] as const;
/** Repo methods that only read (or lock); anything else on a Graph repo writes. */
const READ_METHOD = /^(get|list|find|search|lock)/;
const APPEND_CALL =
  /\b(appendGraphActivityEffect|appendPatchActivityEffect|appendActivityEffect)\(/g;
/**
 * A top-level function: a `function` declaration, or a `const` bound to an
 * arrow or function expression (`export const f = async (...) =>`,
 * `const f = function* () {}`), so an arrow-function mutation cannot hide.
 */
const TOP_LEVEL_FUNCTION =
  /^(?:export )?(?:(?:async )?function\*? (\w+)|const (\w+)\s*(?::[^=\n]+)?=\s*(?:async\s*)?(?:function\b|\(|\w+\s*=>))/gm;

/** Names of the top-level functions in `source`, with the offset each starts at. */
function topLevelFunctions(source: string): { name: string; index: number }[] {
  return [...source.matchAll(TOP_LEVEL_FUNCTION)].map((match) => ({
    name: match[1] ?? match[2] ?? "?",
    index: match.index,
  }));
}

/** A path under `base` as a registry key: forward slashes on every platform. */
function registryPath(base: string, file: string): string {
  return path.relative(base, file).split(path.sep).join("/");
}

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

function productionFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...productionFiles(entryPath));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      files.push(entryPath);
    }
  }
  return files;
}

interface FunctionScan {
  writes: string[];
  appends: number;
  inTransaction: boolean;
}

/** `file#function` to what the function does, for every top-level function in core. */
function scanFunctions(): Map<string, FunctionScan> {
  const writeMethods = repoWriteMethods();
  const repoNames = [...writeMethods.keys()].join("|");
  const repoCall = new RegExp(`\\b(${repoNames})\\.(\\w+)\\(`, "g");
  const found = new Map<string, FunctionScan>();
  for (const file of productionFiles(CORE_SRC)) {
    const source = readFileSync(file, "utf-8");
    const starts = topLevelFunctions(source);
    for (const [index, start] of starts.entries()) {
      const body = source.slice(
        start.index,
        starts[index + 1]?.index ?? source.length
      );
      const writes: string[] = [];
      for (const call of body.matchAll(repoCall)) {
        const [, repo, method] = call;
        if (
          repo !== undefined &&
          method !== undefined &&
          writeMethods.get(repo)?.has(method) === true
        ) {
          writes.push(`${repo}.${method}`);
        }
      }
      found.set(`${registryPath(CORE_SRC, file)}#${start.name}`, {
        writes,
        appends: [...body.matchAll(APPEND_CALL)].length,
        inTransaction: /\btransact\(|\btx: Db(Tx|Exec)\b/.test(body),
      });
    }
  }
  return found;
}

const functions = scanFunctions();
const writers = new Map(
  [...functions].filter(([, scan]) => scan.writes.length > 0)
);
const registered = new Set(GRAPH_MUTATIONS.flatMap((m) => [...m.sites]));
const helpers = new Set(Object.keys(GRAPH_MUTATION_HELPERS));
const exempt = new Set(Object.keys(GRAPH_MUTATION_EXEMPTIONS));

describe("Graph mutation gate scanner", () => {
  it("sees declarations, arrow functions and function expressions", () => {
    const source = [
      "export function declared() {}",
      "export async function* generated() {}",
      "export const arrow = (a: string) => a;",
      "export const asyncArrow = async (",
      "  a: string",
      "): Promise<string> => a;",
      "const bare = x => x;",
      "export const expression = function named() {};",
      "export const typed: Handler = async () => {};",
      "export const notAFunction = 42;",
      "  const nested = () => {};",
    ].join("\n");
    expect(topLevelFunctions(source).map((fn) => fn.name)).toEqual([
      "declared",
      "generated",
      "arrow",
      "asyncArrow",
      "bare",
      "expression",
      "typed",
    ]);
  });

  it("keys registry paths with forward slashes whatever the platform separator", () => {
    const base = path.join("core", "src");
    expect(registryPath(base, path.join(base, "graph", "entities.ts"))).toBe(
      "graph/entities.ts"
    );
    expect(registryPath(base, path.join(base, "graph", "patch", "a.ts"))).toBe(
      "graph/patch/a.ts"
    );
  });
});

describe("Graph mutation gate (ADR-0005 S4)", () => {
  it("finds the Graph writers it is meant to guard", () => {
    // Guards the scanner itself: if the source layout changes and it sees
    // nothing, the checks below would pass vacuously.
    expect(writers.size).toBeGreaterThanOrEqual(25);
    expect(writers.has("graph/entities.ts#createEntityEffect")).toBe(true);
  });

  it("every function that writes a Graph repo is a registered mutation or a documented exemption", () => {
    const unregistered = [...writers.keys()].filter(
      (site) => !registered.has(site) && !helpers.has(site) && !exempt.has(site)
    );
    expect(
      unregistered,
      "Register the mutation in graph/__tests__/graph-mutations.ts (so it is run and counted) and append to the activity log in its transaction, or add an exemption with a reason"
    ).toEqual([]);
  });

  it("the registry names no function that no longer exists", () => {
    const stale = [...registered, ...helpers, ...exempt].filter(
      (site) => !functions.has(site)
    );
    expect(stale).toEqual([]);
    const notWriters = [...helpers, ...exempt].filter(
      (site) => !writers.has(site)
    );
    expect(notWriters, "helpers and exemptions must be Graph writers").toEqual(
      []
    );
  });

  it("a helper's write is appended by a registered mutation that calls it", () => {
    for (const [helper, entry] of Object.entries(GRAPH_MUTATION_HELPERS)) {
      expect(registered.has(entry.appendedBy), helper).toBe(true);
      const [, name] = helper.split("#");
      const [entryFile] = entry.appendedBy.split("#");
      const entrySource = readFileSync(
        path.join(CORE_SRC, entryFile ?? ""),
        "utf-8"
      );
      expect(
        entrySource.includes(`${name ?? "?"}(`),
        `${entry.appendedBy} must call ${helper}`
      ).toBe(true);
    }
  });

  it("every registered mutation appends at least once per repo write, inside its transaction", () => {
    const problems: string[] = [];
    for (const site of registered) {
      const scan = functions.get(site);
      if (scan === undefined) continue;
      if (scan.appends < Math.max(scan.writes.length, 1)) {
        problems.push(
          `${site}: ${scan.writes.length} repo write(s) (${scan.writes.join(", ")}), ${scan.appends} append(s)`
        );
      }
      if (!scan.inTransaction) problems.push(`${site}: no transaction`);
    }
    expect(problems).toEqual([]);
  });

  it("registered mutations use listed verbs and unique names", () => {
    const names = GRAPH_MUTATIONS.map((m) => m.name);
    expect(new Set(names).size).toBe(names.length);
    for (const mutation of GRAPH_MUTATIONS) {
      expect(
        isActivityActionForKind(mutation.kind, mutation.action),
        `${mutation.name}: ${mutation.kind}.${mutation.action}`
      ).toBe(true);
    }
  });

  it("every exemption states a reason", () => {
    for (const [site, reason] of Object.entries(GRAPH_MUTATION_EXEMPTIONS)) {
      expect(reason.length, site).toBeGreaterThan(20);
    }
  });
});
