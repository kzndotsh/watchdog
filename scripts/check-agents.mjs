#!/usr/bin/env node
/**
 * Gate for package/app AGENTS.md hygiene. Checks only:
 *   - AGENTS.md presence in every `packages/*` and `apps/*` directory
 *   - size budget (bytes and lines)
 *   - required sections: root `Quick reference`/`Commands`; nested `> Scope:` blurb + `## Commands`
 *   - relative markdown links in AGENTS.md files resolve
 *   - banned mid-build terms
 *   - CLAUDE.md bridges to @AGENTS.md
 *
 * Every finding is a failure. `--strict` (or CHECK_AGENTS_STRICT=1) makes the
 * process exit 1 on any finding; without it the findings print and exit is 0.
 *
 * Docs-tree link and length checks belong to `scripts/check-docs.mjs`, not here.
 * Link *count* is deliberately not checked: a hub file that indexes many docs is
 * legitimate and a count threshold carried no signal.
 */
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const strict =
  process.argv.includes("--strict") || process.env.CHECK_AGENTS_STRICT === "1";

const MAX_BYTES = 32 * 1024;
const MAX_ROOT_LINES = 200;
const MAX_NESTED_LINES = 150;

const BANNED = [
  { re: /\bwd\s+promote\b/i, label: "wd promote" },
  { re: /\bDoor\s+A\b/, label: "Door A" },
  { re: /\bCandidate\s+theater\b/i, label: "Candidate theater" },
  { re: /\bScratch\b/, label: "Scratch" },
];

const MD_LINK = /\[([^\]]*)\]\(([^)]+)\)/g;

/** @type {string[]} */
const findings = [];

/** @param {string} msg */
function fail(msg) {
  findings.push(msg);
}

/**
 * @param {string} fromFile
 * @param {string} href
 */
function resolveLink(fromFile, href) {
  const clean = href.split("#")[0]?.split("?")[0]?.trim() ?? "";
  if (!clean || clean.startsWith("http") || clean.startsWith("mailto:")) {
    return true;
  }
  if (clean.startsWith("/"))
    return existsSync(path.join(repoRoot, clean.slice(1)));
  return existsSync(path.resolve(path.dirname(fromFile), clean));
}

async function listPackageAppDirs() {
  const perTop = await Promise.all(
    ["packages", "apps"].map(async (top) => {
      const abs = path.join(repoRoot, top);
      if (!existsSync(abs)) return [];
      const names = await readdir(abs);
      const entries = await Promise.all(
        names.map(async (name) => {
          if (name.startsWith(".")) return null;
          const full = path.join(abs, name);
          const st = await stat(full);
          return st.isDirectory() ? path.join(top, name) : null;
        })
      );
      return entries.filter((entry) => entry !== null);
    })
  );
  return perTop.flat();
}

/** @param {string[]} dirs */
function collectInScopeAgents(dirs) {
  const files = [
    path.join(repoRoot, "AGENTS.md"),
    ...dirs.map((rel) => path.join(repoRoot, rel, "AGENTS.md")),
  ];
  return files.filter((f) => existsSync(f));
}

/**
 * @param {string} fileRel
 * @param {string} text
 */
function checkBanned(fileRel, text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.includes("<!-- check:agents allow-banned -->")) continue;
    if (/^##\s+Revision\b/i.test(line)) break;
    for (const { re, label } of BANNED) {
      if (re.test(line)) {
        fail(
          `${fileRel}:${i + 1}: banned mid-build term "${label}" (allowlist with <!-- check:agents allow-banned -->)`
        );
      }
    }
  }
}

/** @param {string} absPath */
async function checkFile(absPath) {
  const rel = path.relative(repoRoot, absPath);
  const text = await readFile(absPath, "utf-8");
  const lineCount = text.split("\n").length;
  const bytes = Buffer.byteLength(text, "utf-8");
  const isRoot = rel === "AGENTS.md";

  if (bytes > MAX_BYTES) {
    fail(`${rel}: exceeds 32 KiB (${bytes} bytes)`);
  }

  if (isRoot) {
    if (lineCount > MAX_ROOT_LINES)
      fail(`${rel}: root >${MAX_ROOT_LINES} lines (${lineCount})`);
    if (!/##\s*(Quick reference|Commands)\b/i.test(text)) {
      fail(`${rel}: missing Quick reference / Commands section`);
    }
  } else {
    if (lineCount > MAX_NESTED_LINES)
      fail(`${rel}: nested >${MAX_NESTED_LINES} lines (${lineCount})`);
    if (!/^>\s*Scope:/m.test(text)) {
      fail(`${rel}: missing Scope blurb ("> Scope: ...")`);
    }
    if (!/##\s*Commands\b/i.test(text)) {
      fail(`${rel}: missing ## Commands section`);
    }
  }

  for (const m of text.matchAll(MD_LINK)) {
    const href = m[2]?.trim() ?? "";
    if (!href || href.startsWith("http") || href.startsWith("mailto:"))
      continue;
    if (href.startsWith("#")) continue;
    if (!resolveLink(absPath, href)) {
      fail(`${rel}: broken link → ${href}`);
    }
  }

  checkBanned(rel, text);
}

/** @param {string[]} dirs */
function checkPresence(dirs) {
  for (const rel of dirs) {
    if (!existsSync(path.join(repoRoot, rel, "AGENTS.md"))) {
      fail(`missing ${rel}/AGENTS.md`);
    }
  }
}

async function checkClaude() {
  const claude = path.join(repoRoot, "CLAUDE.md");
  if (!existsSync(claude)) {
    fail("missing root CLAUDE.md (Claude Code bridge to AGENTS.md)");
    return;
  }
  const text = await readFile(claude, "utf-8");
  if (!text.includes("@AGENTS.md")) {
    fail("CLAUDE.md must reference @AGENTS.md");
  }
}

async function main() {
  const dirs = await listPackageAppDirs();
  checkPresence(dirs);
  await checkClaude();
  await Promise.all(collectInScopeAgents(dirs).map(async (f) => checkFile(f)));

  for (const msg of findings) console.error(`FAIL  ${msg}`);
  console.log(
    `check:agents: ${findings.length} finding(s)${strict ? " [strict]" : " [report-only]"}`
  );
  process.exit(strict && findings.length > 0 ? 1 : 0);
}

await main();
