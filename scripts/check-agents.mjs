#!/usr/bin/env node
/**
 * Gate for package/app AGENTS.md hygiene. Checks only:
 *   - AGENTS.md presence in every `packages/*` and `apps/*` directory
 *   - size budget (bytes and lines)
 *   - required sections: root `Quick reference`/`Commands`; nested `> Scope:` blurb + `## Commands`
 *   - relative markdown links in AGENTS.md files resolve
 *   - banned mid-build terms, read from the `_Banned_:` lines of root GLOSSARY.md (required)
 *   - optional `## Canonical helpers` table (see `checkCanonicalHelpers`): each row's module exists
 *     and exports the named identifier
 *   - CLAUDE.md bridges to @AGENTS.md
 *
 * Every finding is a failure. `--strict` (or CHECK_AGENTS_STRICT=1) makes the
 * process exit 1 on any finding; without it the findings print and exit is 0.
 *
 * Docs-tree link and length checks belong to `scripts/check-docs.mjs`, not here.
 * Link *count* is deliberately not checked: a hub file that indexes many docs is
 * legitimate and a count threshold carried no signal.
 */
import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const strict =
  process.argv.includes("--strict") || process.env.CHECK_AGENTS_STRICT === "1";

const MAX_BYTES = 32 * 1024;
const MAX_ROOT_LINES = 200;
const MAX_NESTED_LINES = 150;

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

/** @param {string[]} dirs */
function collectInScopeAgents(dirs) {
  const files = [
    path.join(repoRoot, "AGENTS.md"),
    ...dirs.map((rel) => path.join(repoRoot, rel, "AGENTS.md")),
  ];
  return files.filter((f) => existsSync(f));
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
  const glossary = path.join(repoRoot, "GLOSSARY.md");
  if (!existsSync(glossary)) {
    fail("missing root GLOSSARY.md (source of the banned-terms list)");
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
      "GLOSSARY.md has no `_Banned_:` lines (the banned-terms gate would be inert)"
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

  checkBanned(rel, text, banned);
  checkCanonicalHelpers(rel, text);
}

/**
 * Does `source` export `name`? A pragmatic text match, not a parse. Counts:
 * `export [declare] [async] function|const|let|var|class|abstract class|type|interface|enum NAME`,
 * and `export [type] { a, b as NAME }` with or without `from` (so a name re-exported
 * from another module by name counts: a barrel is a valid place to point at).
 * `export * from` does NOT count: it hides what is exported, so name the module
 * that declares the helper or list it with `export { NAME } from`.
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
    const names = (m[1] ?? "").split(",").map((part) =>
      part
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .pop()
    );
    if (names.includes(name)) return true;
  }
  return false;
}

/**
 * Optional check. A `## Canonical helpers` heading followed by a markdown table
 * `| Concern | Module | Export |` is verified row by row: Module is a repo-relative
 * path in backticks, Export one or more identifiers in backticks. The module file
 * must exist and export each identifier (see `exportsName`). No such heading, no check.
 * @param {string} rel
 * @param {string} text
 */
function checkCanonicalHelpers(rel, text) {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^##\s+Canonical helpers\s*$/i.test(l));
  if (start === -1) return;
  let headerSeen = false;
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = (lines[i] ?? "").trim();
    if (/^#{1,6}\s/.test(line)) break;
    if (!line.startsWith("|")) continue;
    const cells = line
      .replaceAll(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    if (!headerSeen) {
      headerSeen = true;
      continue;
    }
    const mod = /^`([^`]+)`$/.exec(cells[1] ?? "")?.[1];
    const names = [...(cells[2] ?? "").matchAll(/`([^`]+)`/g)].map(
      (m) => m[1] ?? ""
    );
    if (cells.length !== 3 || !mod || names.length === 0) {
      fail(
        `${rel}:${i + 1}: malformed Canonical helpers row (need | concern | \`module path\` | \`Export\` |)`
      );
      continue;
    }
    const where = `${rel}:${i + 1}: Canonical helpers row "${cells[0]}"`;
    const abs = path.join(repoRoot, mod);
    if (!existsSync(abs)) {
      fail(`${where}: module not found: ${mod}`);
      continue;
    }
    const source = readFileSync(abs, "utf-8");
    for (const name of names) {
      if (!exportsName(source, name)) {
        fail(`${where}: ${mod} does not export \`${name}\``);
      }
    }
  }
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
  const banned = (await loadBanned()) ?? [];
  await Promise.all(
    collectInScopeAgents(dirs).map(async (f) => checkFile(f, banned))
  );

  for (const msg of findings) console.error(`FAIL  ${msg}`);
  console.log(
    `check:agents: ${findings.length} finding(s)${strict ? " [strict]" : " [report-only]"}`
  );
  process.exit(strict && findings.length > 0 ? 1 : 0);
}

await main();
