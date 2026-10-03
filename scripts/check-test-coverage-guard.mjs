#!/usr/bin/env node
/**
 * Coverage guard for the test typecheck: every test file vitest would run must be
 * included by at least one `tsconfig.test.json`.
 *
 * The test file set comes from `vitest list --filesOnly`, so it follows the project
 * include/exclude patterns in vitest.config.ts. The covered set is the expanded
 * `files` list of `tsc -p <config> --showConfig` for every tsconfig.test.json in the
 * repo (include and exclude already applied). Any file in the first set and not the
 * second fails the gate. Playwright specs (not listed by vitest) are added to the
 * first set from `playwright test --list`, so `playwright.config.ts` testDir/testMatch
 * is the single source for what counts as an e2e spec.
 *
 * Why: main tsconfigs exclude tests, which is how tests escaped the typecheck in the
 * first place. Without this guard a new test directory (or a vitest project added
 * for one) would silently fall outside every test config again, and a green
 * typecheck would stop meaning the tests match the types (spec #54).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
/** @param {string} name */
const bin = (name) => path.join(root, "node_modules/.bin", name);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".claude",
  ".worktrees",
  "dist",
  "coverage",
  "repos",
]);

/** @param {string} abs */
const rel = (abs) => path.relative(root, abs).split(path.sep).join("/");

/** @returns {Set<string>} repo-relative test files vitest would discover. */
function vitestFiles() {
  const res = spawnSync(bin("vitest"), ["list", "--filesOnly", "--json"], {
    cwd: root,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) {
    console.error(
      `check:test-coverage-guard: \`vitest list\` failed (exit ${res.status}).\n${res.stderr}`
    );
    process.exit(1);
  }
  /** @type {unknown} */
  const listed = JSON.parse(res.stdout);
  /** @type {Set<string>} */
  const files = new Set();
  if (Array.isArray(listed)) {
    /** @type {unknown[]} */
    const entries = listed;
    for (const entry of entries) {
      if (typeof entry === "object" && entry !== null && "file" in entry) {
        const { file } = entry;
        if (typeof file === "string") {
          files.add(rel(file));
        }
      }
    }
  }
  return files;
}

/**
 * Playwright specs are invisible to vitest, so they are listed from the Playwright
 * config itself (`playwright test --list`, which reads testDir/testMatch and neither
 * starts the web server nor runs globalSetup). No config means no Playwright suite.
 * @returns {Set<string>} repo-relative Playwright spec files.
 */
function playwrightFiles() {
  /** @type {Set<string>} */
  const files = new Set();
  if (!existsSync(path.join(root, "playwright.config.ts"))) return files;
  const res = spawnSync(
    bin("playwright"),
    ["test", "--list", "--reporter=json"],
    { cwd: root, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }
  );
  if (res.status !== 0) {
    console.error(
      `check:test-coverage-guard: \`playwright test --list\` failed (exit ${res.status}).\n${res.stdout}${res.stderr}`
    );
    process.exit(1);
  }
  /** @type {unknown} */
  const listed = JSON.parse(res.stdout);
  if (typeof listed !== "object" || listed === null) return files;
  const rootDir =
    "config" in listed &&
    typeof listed.config === "object" &&
    listed.config !== null &&
    "rootDir" in listed.config &&
    typeof listed.config.rootDir === "string"
      ? listed.config.rootDir
      : root;
  /** @param {unknown} suite */
  const walk = (suite) => {
    if (typeof suite !== "object" || suite === null) return;
    if ("file" in suite && typeof suite.file === "string") {
      files.add(rel(path.resolve(rootDir, suite.file)));
    }
    if ("suites" in suite && Array.isArray(suite.suites)) {
      /** @type {unknown[]} */
      const children = suite.suites;
      for (const child of children) walk(child);
    }
  };
  walk(listed);
  return files;
}

/** @param {string} dir @param {string[]} out */
function findConfigs(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        findConfigs(path.join(dir, entry.name), out);
      }
    } else if (entry.name === "tsconfig.test.json") {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/** @param {string} config @returns {string[]} repo-relative files the config includes. */
function configFiles(config) {
  const res = spawnSync(bin("tsc"), ["-p", config, "--showConfig"], {
    cwd: path.dirname(config),
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0) {
    console.error(
      `check:test-coverage-guard: tsc could not read ${rel(config)}.\n${res.stdout}${res.stderr}`
    );
    process.exit(1);
  }
  /** @type {unknown} */
  const shown = JSON.parse(res.stdout);
  /** @type {string[]} */
  const files = [];
  if (typeof shown === "object" && shown !== null && "files" in shown) {
    const listed = shown.files;
    if (Array.isArray(listed)) {
      for (const f of listed) {
        if (typeof f === "string") {
          files.push(rel(path.resolve(path.dirname(config), f)));
        }
      }
    }
  }
  return files;
}

const discovered = vitestFiles();
if (discovered.size === 0) {
  console.error(
    "check:test-coverage-guard: vitest discovered no test files; refusing to pass vacuously."
  );
  process.exit(1);
}

for (const file of playwrightFiles()) discovered.add(file);

/** @type {Set<string>} */
const covered = new Set();
for (const config of findConfigs(root)) {
  for (const file of configFiles(config)) covered.add(file);
}

const uncovered = [...discovered].filter((f) => !covered.has(f)).sort();
if (uncovered.length > 0) {
  console.error(
    `check:test-coverage-guard: ${uncovered.length} test file(s) are not included by any tsconfig.test.json, so they are never typechecked:`
  );
  for (const file of uncovered) console.error(`  ${file}`);
  console.error(
    "Add the directory to the owning package's tsconfig.test.json `include` (see docs/contributing/testing/standards.md)."
  );
  process.exit(1);
}

console.log(
  `check:test-coverage-guard: ok (${discovered.size} test files, all covered)`
);
