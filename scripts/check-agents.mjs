#!/usr/bin/env node
/**
 * Gate for agent guidance. Checks only:
 *   - nested AGENTS.md files exist only in `NESTED_GUIDES` (server code, Caps, web), and each
 *     of those directories has one
 *   - size budget (bytes and lines): the root guide is at most 120 lines
 *   - required sections: root `Quick reference`/`Commands`; nested `> Scope:` blurb
 *   - relative markdown links in AGENTS.md files resolve
 *   - banned mid-build terms, read from the `_Banned_:` lines of docs/glossary.md (required)
 *   - `@canonical` JSDoc tags (see `checkCanonicalTags`): each tag sits on the export it names,
 *     and every other name it lists is exported by the same module
 *   - CLAUDE.md bridges to @AGENTS.md
 *
 * Every finding is a failure. `--strict` (or CHECK_AGENTS_STRICT=1) makes the
 * process exit 1 on any finding; without it the findings print and exit is 0.
 *
 * Docs-tree link and length checks belong to `scripts/check-docs.mjs`, not here.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const strict =
  process.argv.includes("--strict") || process.env.CHECK_AGENTS_STRICT === "1";

const MAX_BYTES = 32 * 1024;
const MAX_ROOT_LINES = 120;
const MAX_NESTED_LINES = 100;

/**
 * The only directories with a nested guide: server-side code (`packages/core` covers core,
 * api, db, auth, policy, tools, log, env, schemas, the test harnesses and the worker), Caps
 * and web. Everything else an agent learns from the code, the root guide or a gate message.
 */
const NESTED_GUIDES = ["packages/core", "packages/caps", "apps/web"];

/** Source files that may carry an `@canonical` tag. */
const CANONICAL_SOURCE = /^(apps|packages|scripts)\/.*\.(ts|tsx|mts|mjs)$/;
const CANONICAL_TAG = /^\s*(?:\/\*\*|\*)\s*@canonical\b(.*?)(?:\*\/)?\s*$/;

const BANNED_LINE = /^_Banned_:\s*(.+)$/;

/** @param {string} term */
function escapeRegExp(term) {
  return term.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

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

/**
 * Banned phrases from the glossary's `_Banned_: a, b` lines. Matching is exact-case,
 * whitespace-flexible and whole-word (no word character on either side, so a term
 * ending in punctuation such as `C++` still matches). Lines inside fenced code
 * blocks are skipped. Returns null (after recording a finding) when the glossary
 * is missing or lists nothing, so the gate cannot go silently inert.
 * @returns {Promise<{ re: RegExp, label: string }[] | null>}
 */
async function loadBanned() {
  const glossary = path.join(repoRoot, "docs", "glossary.md");
  if (!existsSync(glossary)) {
    fail("missing docs/glossary.md (source of the banned-terms list)");
    return null;
  }
  const text = await readFile(glossary, "utf-8");
  let inFence = false;
  const terms = text
    .split("\n")
    .flatMap((line) => {
      // A fenced block shows the format; its `_Banned_` lines are examples, not terms.
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return [];
      }
      return inFence ? [] : (BANNED_LINE.exec(line)?.[1]?.split(",") ?? []);
    })
    .map((term) => term.replaceAll("`", "").trim())
    .filter(Boolean);
  if (terms.length === 0) {
    fail(
      "docs/glossary.md has no `_Banned_:` lines (the banned-terms gate would be inert)"
    );
    return null;
  }
  return terms.map((label) => ({
    label,
    re: new RegExp(
      String.raw`(?<![\w])${label
        .split(/\s+/)
        .map(escapeRegExp)
        .join(String.raw`\s+`)}(?![\w])`
    ),
  }));
}

/**
 * @param {string} fileRel
 * @param {string} text
 * @param {{ re: RegExp, label: string }[]} banned
 */
function checkBanned(fileRel, text, banned) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.includes("<!-- check:agents allow-banned -->")) continue;
    if (/^##\s+Revision\b/i.test(line)) break;
    for (const { re, label } of banned) {
      if (re.test(line)) {
        fail(
          `${fileRel}:${i + 1}: banned mid-build term "${label}" (allowlist with <!-- check:agents allow-banned -->)`
        );
      }
    }
  }
}

/**
 * @param {string} absPath
 * @param {{ re: RegExp, label: string }[]} banned
 */
async function checkFile(absPath, banned) {
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

  checkBanned(rel, text, banned);
}

/**
 * Does `source` export `name`? A pragmatic text match, not a parse. Counts:
 * `export [declare] [async] function|const|let|var|class|abstract class|type|interface|enum NAME`,
 * and `export [type] { a, b as NAME }` with or without `from` (so a name re-exported
 * from another module by name counts). `export * from` does NOT count: it hides what is
 * exported.
 * @param {string} source
 * @param {string} name
 */
function exportsName(source, name) {
  const id = escapeRegExp(name);
  const declared = new RegExp(
    String.raw`^\s*export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|abstract\s+class|type|interface|enum)\s+${id}(?![\w$])`,
    "m"
  );
  if (declared.test(source)) return true;
  for (const m of source.matchAll(/^\s*export\s+(?:type\s+)?\{([^}]*)\}/gm)) {
    if (listedNames(m[1] ?? "").includes(name)) return true;
  }
  return false;
}

/** @param {string} list the inside of `export { ... }` */
function listedNames(list) {
  return list.split(",").map((part) =>
    part
      .trim()
      .replace(/^type\s+/, "")
      .split(/\s+as\s+/)
      .pop()
  );
}

/** Tracked and untracked (not ignored) files: the canonical-tag scan's input. */
function listSourceFiles() {
  const out = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: repoRoot, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }
  );
  return [...new Set(out.split("\n"))].filter((f) => CANONICAL_SOURCE.test(f));
}

/**
 * The reusable kit is marked in the code: a JSDoc block carrying
 * `@canonical \`name\`[, \`other\`]: when to use it` sits directly above the export of `name`
 * (lint-disable comment lines may sit between). The other names are exported by the same
 * module. `git grep -n '@canonical'` lists the kit; this check keeps every tag attached.
 */
async function checkCanonicalTags() {
  const files = listSourceFiles();
  const texts = await Promise.all(
    files.map(async (rel) => {
      const abs = path.join(repoRoot, rel);
      return existsSync(abs) ? readFile(abs, "utf-8") : "";
    })
  );
  for (const [k, rel] of files.entries()) {
    const source = texts[k] ?? "";
    if (!source.includes("@canonical")) continue;
    const lines = source.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      const tag = CANONICAL_TAG.exec(lines[i] ?? "");
      if (!tag) continue;
      const where = `${rel}:${i + 1}: @canonical`;
      const head = /^\s+((?:`[\w$]+`\s*,\s*)*`[\w$]+`)\s*:\s*\S/.exec(
        tag[1] ?? ""
      );
      if (!head) {
        fail(
          `${where} tag must read \`@canonical \`name\`[, \`other\`]: when to use it\``
        );
        continue;
      }
      const names = [...(head[1] ?? "").matchAll(/`([\w$]+)`/g)].map(
        (m) => m[1] ?? ""
      );
      const first = names[0] ?? "";
      let j = i;
      while (j < lines.length && !(lines[j] ?? "").includes("*/")) j += 1;
      j += 1;
      while (
        j < lines.length &&
        /^\s*\/\/\s*(oxlint|eslint)-/.test(lines[j] ?? "")
      )
        j += 1;
      const target = lines[j] ?? "";
      const attached =
        exportsName(target, first) ||
        (/^\s*export\s+(?:type\s+)?\{/.test(target) &&
          exportsName(lines.slice(j, j + 40).join("\n"), first));
      if (!attached) {
        fail(
          `${where} \`${first}\` must tag the JSDoc directly above \`export ... ${first}\``
        );
      }
      for (const name of names.slice(1)) {
        if (!exportsName(source, name)) {
          fail(`${where} ${rel} does not export \`${name}\``);
        }
      }
    }
  }
}

/** @param {string[]} dirs */
function checkNestedPlacement(dirs) {
  for (const rel of dirs) {
    const has = existsSync(path.join(repoRoot, rel, "AGENTS.md"));
    const allowed = NESTED_GUIDES.includes(rel);
    if (allowed && !has) fail(`missing ${rel}/AGENTS.md`);
    if (!allowed && has) {
      fail(
        `${rel}/AGENTS.md: nested guides live only in ${NESTED_GUIDES.join(", ")}; fold what the code and gates cannot say into one of them`
      );
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
  checkNestedPlacement(dirs);
  await checkClaude();
  const banned = (await loadBanned()) ?? [];
  const guides = [
    path.join(repoRoot, "AGENTS.md"),
    ...NESTED_GUIDES.map((rel) => path.join(repoRoot, rel, "AGENTS.md")),
  ].filter((f) => existsSync(f));
  await Promise.all(guides.map(async (f) => checkFile(f, banned)));
  await checkCanonicalTags();

  for (const msg of findings) console.error(`FAIL  ${msg}`);
  console.log(
    `check:agents: ${findings.length} finding(s)${strict ? " [strict]" : " [report-only]"}`
  );
  process.exit(strict && findings.length > 0 ? 1 : 0);
}

await main();
