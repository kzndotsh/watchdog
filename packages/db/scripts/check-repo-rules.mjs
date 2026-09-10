#!/usr/bin/env node
/**
 * Enforce the packages/db repo contract rules that oxlint cannot see.
 * Contract and rationale: packages/db/AGENTS.md.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../src/repos");

const BANNED = [
  {
    re: /\bnotifyEvent\b/,
    msg: "rule 2: repos must not emit events — services notify after commit",
  },
  {
    re: /\.transaction\s*\(/,
    msg: "rule 4: repos must not open transactions — services own the boundary",
  },
  {
    re: /\bthrow\s+new\b/,
    msg: "rule 3: repos must not throw — return null/[] and let the service decide",
  },
  {
    re: /\.toISOString\s*\(/,
    msg: "rule 1: repos return rows, not DTOs — date formatting belongs in the service",
  },
  {
    re: /:\s*SQL(<[^>]*>)?\b/,
    msg: "rule 5: repos take plain values, never drizzle SQL fragments",
  },
];

/** Lookup-only trim helpers — not display write validation. */
const TRIM_ALLOWLIST = new Set([
  "getIdByName",
  "getCiphertext",
  "deleteByName",
  "findIdByIdempotency",
  "listActiveForCapability",
  "listSucceededForCapability",
  "lookupActive",
  "upsert",
]);

const TRIM_RE = /\btrimmedOr(?:Null|Undefined)\s*\(/;

/** Every repo takes the pool-or-transaction handle as its first parameter. */
const METHOD = /^ {2}async (\w+)\((.*)$/;
const FIRST_PARAM = /^\s*(\w+)\s*:/;

const rootEntries = await readdir(root);
const files = rootEntries.filter((f) => f.endsWith(".repo.ts"));
let failed = false;

/**
 * @param {string} file
 * @param {number} lineNo
 * @param {string} msg
 * @param {string} line
 */
function fail(file, lineNo, msg, line) {
  console.error(`${file}:${lineNo}: ${msg}`);
  console.error(`  ${line.trim()}`);
  failed = true;
}

const fileTexts = await Promise.all(
  files.map(async (file) => readFile(path.join(root, file), "utf-8"))
);

for (const [fileIndex, file] of files.entries()) {
  const lines = fileTexts[fileIndex].split("\n");
  let currentMethod = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    const method = METHOD.exec(line);
    if (method) {
      currentMethod = method[1];
    }

    for (const { re, msg } of BANNED) {
      if (re.test(line)) fail(file, i + 1, msg, line);
    }

    if (TRIM_RE.test(line)) {
      if (/\btrimmedOrNull\s*\(/.test(line)) {
        fail(
          file,
          i + 1,
          "write vs lookup: repos must not trim display strings — use trimmedOrNull in core/schemas only",
          line
        );
      } else if (currentMethod === null || !TRIM_ALLOWLIST.has(currentMethod)) {
        fail(
          file,
          i + 1,
          `write vs lookup: trimmedOrUndefined is lookup-only (allowed methods: ${[...TRIM_ALLOWLIST].join(", ")})`,
          line
        );
      }
    }

    if (!method) continue;
    // Params may wrap onto the next line.
    const params = method[2].trim() || (lines[i + 1] ?? "");
    const paramName = FIRST_PARAM.exec(params)?.[1];
    if (paramName !== "exec") {
      fail(
        file,
        i + 1,
        `rule 0: ${method[1]} must take \`exec: DbExec\` first so callers can join a transaction`,
        line
      );
    }
  }
}

if (failed) process.exit(1);
console.log(`repo-rules: ok (${files.length} files)`);
