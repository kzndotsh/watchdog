#!/usr/bin/env node
/**
 * Fail when Effect.runPromise / runPromiseExit / runSync / runFork /
 * runCallback appear outside documented process/HTTP/test-compat edges,
 * when tryPromise lacks `{ catch }`, or when production code still throws
 * `DomainError`.
 *
 * --strict (or CHECK_EFFECT_EDGES_STRICT=1): exit 1 on any hit.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const strict =
  process.argv.includes("--strict") ||
  process.env.CHECK_EFFECT_EDGES_STRICT === "1";

const CALL =
  /\bEffect\.run(?:PromiseExit|Promise|Sync|Fork|Callback)\s*\(|\bappRuntime\.runPromise\s*\(/;

/** Paths relative to repo root. Tests (`__tests__`, `*.test.ts`) are skipped. */
const ALLOW = new Set([
  "packages/api/src/runtime.ts",
  "apps/worker/src/boot-worker.ts",
  "packages/core/src/infra/run-domain.ts",
  "packages/core/src/infra/postgres-tx.ts",
  "packages/core/src/infra/export-sync.ts",
  "packages/cap-sdk/src/run.ts",
]);

const ROOTS = [
  "packages/core/src",
  "packages/api/src",
  "packages/tools/src",
  "packages/policy/src",
  "packages/cap-sdk/src",
  "packages/caps/src",
  "packages/ai/src",
  "packages/db/src",
  "packages/cli/src",
  "packages/log/src",
  "apps/worker/src",
  "apps/web/src",
];

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function walkTs(dir) {
  /** @type {import("node:fs").Dirent[]} */
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name !== "__tests__" &&
          entry.name !== "node_modules"
      )
      .map(async (entry) => walkTs(path.join(dir, entry.name)))
  );
  const here = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
        !entry.name.includes(".test.")
    )
    .map((entry) => path.join(dir, entry.name));
  return [...here, ...nested.flat()];
}

/**
 * @param {string} line
 * @returns {boolean}
 */
function isCommentLine(line) {
  const t = line.trimStart();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

/**
 * @param {string} abs
 * @returns {Promise<string[]>}
 */
async function hitsInFile(abs) {
  const rel = path.relative(root, abs).split(path.sep).join("/");
  const text = await readFile(abs, "utf-8");
  /** @type {string[]} */
  const msgs = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (line === undefined || isCommentLine(line)) continue;
    if (/\bthrow new DomainError\b/.test(line)) {
      msgs.push(`${rel}:${index + 1}: throw DomainError; yield tagged errors`);
    }
    if (ALLOW.has(rel)) continue;
    if (!CALL.test(line)) continue;
    msgs.push(`${rel}:${index + 1}: Effect run* outside allowlisted edge`);
  }
  if (!ALLOW.has(rel)) {
    msgs.push(...tryPromiseWithoutCatch(text, rel));
  }
  return msgs;
}

/**
 * Bare `Effect.tryPromise(thunk)` / `Effect.try(thunk)` defaults E to UnknownError.
 * @param {string} text
 * @param {string} rel
 * @returns {string[]}
 */
function tryPromiseWithoutCatch(text, rel) {
  /** @type {string[]} */
  const msgs = [];
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    if (line === undefined || isCommentLine(line)) continue;
    if (!/\bEffect\.try(?:Promise)?\s*\(/.test(line)) continue;
    const window = lines.slice(index, index + 200).join("\n");
    if (/\bcatch\s*:/.test(window)) continue;
    msgs.push(
      `${rel}:${index + 1}: Effect.try/tryPromise must use { try, catch }`
    );
  }
  return msgs;
}

const walked = await Promise.all(
  ROOTS.map(async (relRoot) => walkTs(path.join(root, relRoot)))
);
const files = walked.flat();
const perFile = await Promise.all(files.map(hitsInFile));
const findings = perFile.flat();

if (findings.length === 0) {
  console.log(`check:effect-edges: ok${strict ? " [strict]" : ""}`);
  process.exit(0);
}

for (const msg of findings) {
  console.log(`FAIL  ${msg}`);
}
console.log(
  `check:effect-edges: ${findings.length} finding(s)${strict ? " [strict]" : " [warn]"}`
);
process.exit(strict ? 1 : 0);
