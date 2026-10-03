#!/usr/bin/env node
/**
 * Test typecheck runner with a ratchet.
 *
 * Runs every test typecheck project and prints a per-package table of error counts
 * (errors, files with errors) plus a total. A project is either a workspace package or
 * app whose package.json defines `typecheck:tests` (run through pnpm), or one of the
 * root-level test directories without a package (`scripts/`, `e2e/`) that carries a
 * `tsconfig.test.json` (run with tsc directly).
 *
 * Exit code: nonzero only when a project on the clean list
 * (`scripts/test-typecheck-clean.json`, an array of project paths such as
 * "packages/api") has errors or crashes, or when the list names a project that does
 * not exist. Errors in any other project are reported and tolerated.
 *
 * Why: every main tsconfig excludes tests, so tests drifted from the types they
 * exercise while staying green. Fixing the drift happens one package per change; the
 * ratchet lets each fixed package become blocking in the same change that zeroes it,
 * so it cannot regress while the others are still in progress. When the list covers
 * every project the main `typecheck` takes over and this script is deleted
 * (spec #54, contract step).
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const cleanListPath = path.join(root, "scripts/test-typecheck-clean.json");

/** Root-level test directories that are not workspace packages. */
const ROOT_PROJECTS = ["scripts", "e2e"];
const WORKSPACE_PARENTS = ["apps", "packages"];

const ANSI = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, "g");
const FILE_ERROR = /^(.+?)\(\d+,\d+\): error TS\d+:/;
const CONFIG_ERROR = /^error TS\d+:/;

/**
 * @typedef {object} Project
 * @property {string} name Path shown in the table and used in the clean list.
 * @property {string} cwd Directory the command runs in.
 * @property {string} command Executable to spawn.
 * @property {string[]} args Arguments for the executable.
 */

/**
 * @typedef {object} Result
 * @property {number} errors Count of tsc errors parsed from the output.
 * @property {number} files Distinct files with errors.
 * @property {boolean} crashed The script failed without printing a parsable tsc error.
 */

/**
 * @param {string} packageJson
 * @returns {boolean}
 */
function hasTestTypecheckScript(packageJson) {
  /** @type {unknown} */
  const pkg = JSON.parse(packageJson);
  if (typeof pkg !== "object" || pkg === null || !("scripts" in pkg)) {
    return false;
  }
  const { scripts } = pkg;
  return (
    typeof scripts === "object" &&
    scripts !== null &&
    "typecheck:tests" in scripts &&
    typeof scripts["typecheck:tests"] === "string"
  );
}

/** @returns {Project[]} */
function discoverProjects() {
  /** @type {Project[]} */
  const projects = [];
  for (const parent of WORKSPACE_PARENTS) {
    const parentDir = path.join(root, parent);
    if (!existsSync(parentDir)) {
      continue;
    }
    for (const entry of readdirSync(parentDir).sort()) {
      const pkgPath = path.join(parentDir, entry, "package.json");
      if (!existsSync(pkgPath)) {
        continue;
      }
      if (!hasTestTypecheckScript(readFileSync(pkgPath, "utf-8"))) {
        continue;
      }
      projects.push({
        name: `${parent}/${entry}`,
        cwd: path.join(parentDir, entry),
        command: "pnpm",
        args: ["run", "typecheck:tests"],
      });
    }
  }
  for (const dir of ROOT_PROJECTS) {
    const config = path.join(root, dir, "tsconfig.test.json");
    if (!existsSync(config)) {
      continue;
    }
    projects.push({
      name: dir,
      cwd: root,
      command: path.join(root, "node_modules/.bin/tsc"),
      args: ["-p", config, "--noEmit"],
    });
  }
  return projects;
}

/**
 * Run a project and capture stdout + stderr.
 * @param {Project} project
 * @returns {Promise<{ out: string, failed: boolean }>}
 */
async function capture(project) {
  // spawn has no promise API; this is the one place a hand-built promise is needed.
  // oxlint-disable-next-line promise/avoid-new
  return new Promise((resolve) => {
    const child = spawn(project.command, project.args, {
      cwd: project.cwd,
      env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
    });
    let out = "";
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      out += String(chunk);
    });
    child.on("error", () => {
      resolve({ out, failed: true });
    });
    child.on("close", (code) => {
      resolve({ out, failed: code !== 0 });
    });
  });
}

/**
 * @param {Project} project
 * @returns {Promise<Result>}
 */
async function runProject(project) {
  const { out, failed } = await capture(project);
  let errors = 0;
  /** @type {Set<string>} */
  const files = new Set();
  for (const raw of out.split("\n")) {
    const line = raw.replace(ANSI, "").trim();
    const fileMatch = FILE_ERROR.exec(line);
    if (fileMatch?.[1]) {
      errors += 1;
      files.add(fileMatch[1]);
    } else if (CONFIG_ERROR.test(line)) {
      errors += 1;
      files.add("(config)");
    }
  }
  // A failed run with no parsable error means the script itself broke (missing
  // binary, bad config): never read that as "zero errors".
  if (failed && errors === 0) {
    return { errors: 1, files: 1, crashed: true };
  }
  return { errors, files: files.size, crashed: false };
}

/** @returns {string[]} */
function readCleanList() {
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(cleanListPath, "utf-8"));
  /** @type {string[]} */
  const names = [];
  if (!Array.isArray(parsed)) {
    throw new TypeError(`${cleanListPath} must be a JSON array of paths`);
  }
  for (const entry of parsed) {
    if (typeof entry !== "string") {
      throw new TypeError(`${cleanListPath} must hold only strings`);
    }
    names.push(entry);
  }
  return names;
}

/**
 * Run `fn` over `items` with at most `limit` in flight, keeping input order.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
async function mapPool(items, limit, fn) {
  /** @type {R[]} */
  const results = [];
  let next = 0;
  const worker = async () => {
    const i = next;
    next += 1;
    if (i >= items.length) {
      return;
    }
    results[i] = await fn(items[i]);
    await worker();
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

const projects = discoverProjects();
if (projects.length === 0) {
  console.error(
    "typecheck:tests: no test typecheck projects found (expected a typecheck:tests script in apps/* or packages/*)"
  );
  process.exit(1);
}

const clean = readCleanList();
const known = new Set(projects.map((p) => p.name));
const unknown = clean.filter((name) => !known.has(name));

const results = await mapPool(
  projects,
  Math.max(1, Math.min(4, os.availableParallelism())),
  runProject
);

const width = Math.max("project".length, ...projects.map((p) => p.name.length));

/** @param {number} n */
const cell = (n) => String(n).padStart(6);

/** @param {string} name @param {Result} r */
function statusOf(name, r) {
  if (!clean.includes(name)) {
    return "";
  }
  return r.errors === 0 ? "clean" : "FAIL";
}

console.log("test typecheck (blocking only for projects on the clean list)");
console.log(
  `${"project".padEnd(width)}${"errors".padStart(8)}${"files".padStart(7)}  status`
);
let totalErrors = 0;
let totalFiles = 0;
/** @type {string[]} */
const violations = [];
for (const [i, project] of projects.entries()) {
  const r = results[i];
  totalErrors += r.errors;
  totalFiles += r.files;
  const note = r.crashed ? " (script failed, no tsc errors parsed)" : "";
  console.log(
    `${project.name.padEnd(width)}  ${cell(r.errors)}${cell(r.files)}  ${statusOf(project.name, r)}${note}`
  );
  if (clean.includes(project.name) && r.errors > 0) {
    violations.push(project.name);
  }
}
console.log(
  `${"total".padEnd(width)}  ${cell(totalErrors)}${cell(totalFiles)}`
);

if (unknown.length > 0) {
  console.error(
    `\ntypecheck:tests: clean list names no such test typecheck project: ${unknown.join(", ")}`
  );
}
if (violations.length > 0) {
  console.error(
    `\ntypecheck:tests: ${violations.join(", ")} on the clean list (scripts/test-typecheck-clean.json) must have zero test type errors. Fix the tests to match the current types; do not cast or @ts-expect-error.`
  );
}
process.exit(violations.length > 0 || unknown.length > 0 ? 1 : 0);
