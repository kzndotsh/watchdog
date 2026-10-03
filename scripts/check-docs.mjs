#!/usr/bin/env node
/**
 * Durable-docs gate: recursive docs/** link + anchor checks, root markdown
 * (README/ROADMAP/CLAUDE), AGENTS.md links at fail level, docs/README.md index
 * coverage, the conventions table (docs/reference/platform/conventions.md:
 * every row has an enforced-by cell and a valid status, named scripts and
 * test files exist), and optional leaf line-budget warns.
 *
 * --strict (or CHECK_DOCS_STRICT=1): exit 1 on any fail.
 * --fail-length: treat leaf line-budget exceeds as fails (D6).
 */
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const strict =
  process.argv.includes("--strict") || process.env.CHECK_DOCS_STRICT === "1";
const failLength = process.argv.includes("--fail-length");

const MD_LINK = /\[([^\]]*)\]\(([^)]+)\)/g;
const HEADING = /^#{1,6}\s+(.+?)\s*$/;

/** @type {{ level: "warn" | "fail"; msg: string }[]} */
const findings = [];

/**
 * @param {"warn" | "fail"} level
 * @param {string} msg
 */
function note(level, msg) {
  findings.push({ level, msg });
}

/**
 * The heading anchor algorithm used by the GitHub markdown renderer: lowercase,
 * drop everything except letters, numbers, marks, underscores, spaces and
 * hyphens (unicode letters stay; an em dash vanishes and leaves its
 * surrounding spaces), then each space becomes a hyphen.
 * @param {string} heading
 * @returns {string}
 */
function slugify(heading) {
  return heading
    .replaceAll(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{M}\p{N}_ -]/gu, "")
    .replaceAll(" ", "-");
}

/**
 * Anchors generated for a document; repeated headings get -1, -2, ... suffixes.
 * Headings inside code fences are not headings.
 * @param {string} text
 * @returns {Set<string>}
 */
function collectAnchors(text) {
  /** @type {Set<string>} */
  const set = new Set();
  /** @type {Map<string, number>} */
  const seen = new Map();
  let fence = "";
  for (const line of text.split("\n")) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker[0] ?? "";
      else if (marker.startsWith(fence)) fence = "";
      continue;
    }
    if (fence) continue;
    const m = HEADING.exec(line);
    if (!m?.[1]) continue;
    const base = slugify(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    set.add(n === 0 ? base : `${base}-${n}`);
  }
  return set;
}

/**
 * @param {string} hash
 * @returns {string}
 */
function fragment(hash) {
  try {
    return decodeURIComponent(hash).toLowerCase();
  } catch {
    return hash.toLowerCase();
  }
}

/**
 * @param {string} fromFile
 * @param {string} href
 * @returns {{ ok: boolean; reason?: string; target?: string; hash?: string }}
 */
function resolveLink(fromFile, href) {
  const hashIdx = href.indexOf("#");
  /** @type {string} */
  let pathPart = href;
  /** @type {string | undefined} */
  let hash;
  if (hashIdx !== -1) {
    pathPart = href.slice(0, hashIdx);
    hash = href.slice(hashIdx + 1);
  }
  const clean = pathPart.split("?")[0]?.trim() ?? "";
  if (clean.length === 0) {
    return { ok: true, hash };
  }
  if (clean.startsWith("http") || clean.startsWith("mailto:")) {
    return { ok: true };
  }
  const target = clean.startsWith("/")
    ? path.join(root, clean.slice(1))
    : path.resolve(path.dirname(fromFile), clean);
  if (!existsSync(target)) {
    return { ok: false, reason: "missing file" };
  }
  return { ok: true, target, hash };
}

/**
 * @param {string} dirAbs
 * @returns {Promise<string[]>}
 */
async function walkMd(dirAbs) {
  if (!existsSync(dirAbs)) return [];
  const entries = await readdir(dirAbs, { withFileTypes: true });
  const nested = await Promise.all(
    entries
      .filter(
        (ent) =>
          ent.isDirectory() &&
          !ent.name.startsWith(".") &&
          ent.name !== "node_modules"
      )
      .map(async (ent) => walkMd(path.join(dirAbs, ent.name)))
  );
  const files = entries
    .filter((ent) => ent.isFile() && ent.name.endsWith(".md"))
    .map((ent) => path.join(dirAbs, ent.name));
  return [...files, ...nested.flat()];
}

/**
 * @param {string} absPath
 * @param {{ failLevel: "warn" | "fail"; checkLength?: boolean }} opts
 */
async function checkMarkdownFile(absPath, opts) {
  const rel = path.relative(root, absPath);
  const text = await readFile(absPath, "utf-8");
  const anchors = collectAnchors(text);
  const lines = text.split("\n").length;

  if (opts.checkLength) {
    const allow = text.includes("<!-- docs:allow-length -->");
    if (!allow) {
      if (lines > 600) {
        note(
          failLength ? "fail" : "warn",
          `${rel}: >600 lines (${lines})${failLength ? "" : " [warn until D6]"}`
        );
      } else if (lines > 400) {
        note("warn", `${rel}: >400 lines (${lines})`);
      }
    }
  }

  /** @type {{ href: string; resolved: ReturnType<typeof resolveLink> }[]} */
  const external = [];
  for (const m of text.matchAll(MD_LINK)) {
    const href = m[2]?.trim() ?? "";
    if (!href || href.startsWith("http") || href.startsWith("mailto:"))
      continue;

    if (href.startsWith("#")) {
      if (!anchors.has(fragment(href.slice(1)))) {
        note(opts.failLevel, `${rel}: broken anchor → ${href}`);
      }
      continue;
    }

    const resolved = resolveLink(absPath, href);
    if (!resolved.ok) {
      note(opts.failLevel, `${rel}: broken link → ${href}`);
      continue;
    }
    if (resolved.hash && resolved.target) {
      external.push({ href, resolved });
    }
  }

  const uniqueTargets = [
    ...new Set(external.map((e) => e.resolved.target).filter(Boolean)),
  ];
  /** @type {Map<string, Set<string>>} */
  const anchorByTarget = new Map();
  await Promise.all(
    uniqueTargets.map(async (target) => {
      if (!target) return;
      const targetText = await readFile(target, "utf-8");
      anchorByTarget.set(target, collectAnchors(targetText));
    })
  );

  for (const { href, resolved } of external) {
    const target = resolved.target;
    const hash = resolved.hash;
    if (!(target && hash)) continue;
    const targetAnchors = anchorByTarget.get(target);
    if (!targetAnchors?.has(fragment(hash))) {
      note(
        opts.failLevel,
        `${rel}: broken anchor → ${href} (no #${hash} in ${path.relative(root, target)})`
      );
    }
  }
}

async function checkReadmeIndex() {
  const readmePath = path.join(root, "docs/README.md");
  if (!existsSync(readmePath)) {
    note("fail", "docs/README.md missing");
    return;
  }
  const readme = await readFile(readmePath, "utf-8");
  const leaves = await walkMd(path.join(root, "docs"));
  for (const abs of leaves) {
    const rel = path.relative(root, abs).replaceAll("\\", "/");
    if (rel === "docs/README.md") continue;
    const fromDocs = path
      .relative(path.join(root, "docs"), abs)
      .replaceAll("\\", "/");
    const patterns = [
      fromDocs,
      fromDocs.replace(/\.md$/, ""),
      path.basename(abs),
    ];
    const listed = patterns.some(
      (p) =>
        readme.includes(`](${p})`) ||
        readme.includes(`](${p}.md)`) ||
        readme.includes(`\`${p}\``) ||
        readme.includes(`\`${rel}\``)
    );
    if (!listed) {
      note("warn", `docs/README.md: leaf not indexed → ${rel}`);
    }
  }
}

const CONVENTIONS_PATH = "docs/reference/platform/conventions.md";
const STATUSES = new Set(["enforced", "baselined", "guidance"]);
/** Backticked enforced-by tokens shaped like a package script (`check:size`, `ds:check`). */
const SCRIPT_TOKEN = /^(?:check|validate|test|ds):[\w:-]+$/;
const TEST_FILE_TOKEN = /\/.+\.(?:test|spec)\.tsx?$/;

/**
 * Script names defined by one package.json ([] when absent or unreadable).
 * @param {string} file
 * @returns {Promise<string[]>}
 */
async function readScriptNames(file) {
  if (!existsSync(file)) return [];
  try {
    /** @type {unknown} */
    const parsed = JSON.parse(await readFile(file, "utf-8"));
    const scripts =
      typeof parsed === "object" && parsed !== null && "scripts" in parsed
        ? parsed.scripts
        : undefined;
    return typeof scripts === "object" && scripts !== null
      ? Object.keys(scripts)
      : [];
  } catch {
    note("fail", `${path.relative(root, file)}: unreadable package.json`);
    return [];
  }
}

/**
 * Names of every script in the root package.json and each apps/* / packages/* one.
 * @returns {Promise<Set<string>>}
 */
async function collectScriptNames() {
  const groups = await Promise.all(
    ["apps", "packages"].map(async (top) => {
      const abs = path.join(root, top);
      if (!existsSync(abs)) return [];
      const names = await readdir(abs);
      return names.map((name) => path.join(abs, name, "package.json"));
    })
  );
  const manifests = [path.join(root, "package.json"), ...groups.flat()];
  const names = await Promise.all(manifests.map(readScriptNames));
  return new Set(names.flat());
}

/**
 * Split a markdown table row into trimmed cells (no escaped-pipe support: rows are terse).
 * @param {string} line
 * @returns {string[]}
 */
function tableCells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/**
 * Problems with one conventions row: [rule, scope, stated in, enforced by, status].
 * @param {string[]} cells
 * @param {Set<string>} scripts
 * @returns {string[]}
 */
function conventionRowProblems(cells, scripts) {
  if (cells.length !== 5) {
    return [
      `expected 5 cells (rule, scope, stated in, enforced by, status), got ${cells.length}`,
    ];
  }
  const rule = cells[0] ?? "";
  const enforcedBy = cells[3] ?? "";
  const status = cells[4] ?? "";
  /** @type {string[]} */
  const problems = [];
  if (!rule) problems.push("empty rule cell");
  if (!enforcedBy) return [...problems, "empty enforced-by cell"];
  if (!STATUSES.has(status)) {
    problems.push(
      `invalid status "${status}" (use enforced, baselined or guidance)`
    );
  }
  if (enforcedBy === "guidance") {
    if (status === "enforced" || status === "baselined") {
      problems.push(`status "${status}" but enforced-by is guidance`);
    }
    return problems;
  }
  for (const span of enforcedBy.matchAll(/`([^`]+)`/g)) {
    // `pnpm --filter @watchdog/db check:repos` names the script check:repos.
    const words = (span[1] ?? "")
      .split(/\s+/)
      .filter((w) => w !== "pnpm" && !w.startsWith("-") && !w.startsWith("@"));
    const token = words.at(-1) ?? "";
    if (SCRIPT_TOKEN.test(token) && !scripts.has(token)) {
      problems.push(`script "${token}" is not defined in any package.json`);
    } else if (
      TEST_FILE_TOKEN.test(token) &&
      !existsSync(path.join(root, token))
    ) {
      problems.push(`file "${token}" does not exist`);
    }
  }
  return problems;
}

/**
 * Conventions table gate: every rule row names what enforces it and its status.
 * A row claiming `enforced` or `baselined` cannot say `guidance`; named scripts
 * and test files must exist.
 */
async function checkConventions() {
  const abs = path.join(root, CONVENTIONS_PATH);
  if (!existsSync(abs)) {
    note(
      "fail",
      `${CONVENTIONS_PATH}: missing (the conventions table is required)`
    );
    return;
  }
  const scripts = await collectScriptNames();
  const text = await readFile(abs, "utf-8");
  let tables = 0;
  let inTable = false;
  for (const line of text.split("\n")) {
    if (!line.trim().startsWith("|")) {
      inTable = false;
      continue;
    }
    const cells = tableCells(line);
    const lower = new Set(cells.map((c) => c.toLowerCase()));
    if (lower.has("enforced by") && lower.has("status")) {
      inTable = true;
      tables += 1;
      continue;
    }
    if (!inTable || cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
    for (const why of conventionRowProblems(cells, scripts)) {
      note("fail", `${CONVENTIONS_PATH}: ${why} → ${line.trim()}`);
    }
  }
  if (tables === 0) {
    note(
      "fail",
      `${CONVENTIONS_PATH}: no conventions table (header needs "Enforced by" and "Status")`
    );
  }
}

async function main() {
  const docLeaves = await walkMd(path.join(root, "docs"));

  await Promise.all(
    docLeaves.map(async (f) =>
      checkMarkdownFile(f, { failLevel: "fail", checkLength: true })
    )
  );

  const rootMd = ["README.md", "ROADMAP.md", "CLAUDE.md"]
    .map((n) => path.join(root, n))
    .filter((p) => existsSync(p));
  await Promise.all(
    rootMd.map(async (f) =>
      checkMarkdownFile(f, { failLevel: "fail", checkLength: false })
    )
  );

  const agentFiles = [path.join(root, "AGENTS.md")];
  const packageAgentLists = await Promise.all(
    ["packages", "apps"].map(async (top) => {
      const abs = path.join(root, top);
      if (!existsSync(abs)) return [];
      const names = await readdir(abs);
      return names
        .map((name) => path.join(abs, name, "AGENTS.md"))
        .filter((agents) => existsSync(agents));
    })
  );
  agentFiles.push(...packageAgentLists.flat());
  await Promise.all(
    agentFiles.map(async (f) =>
      checkMarkdownFile(f, { failLevel: "fail", checkLength: false })
    )
  );

  await checkReadmeIndex();
  await checkConventions();

  let warns = 0;
  let fails = 0;
  for (const { level, msg } of findings) {
    if (level === "fail") {
      fails += 1;
      console.error(`FAIL  ${msg}`);
    } else {
      warns += 1;
      console.warn(`WARN  ${msg}`);
    }
  }

  console.log(
    `check:docs: ${findings.length} finding(s) (${fails} fail, ${warns} warn)${strict ? " [strict]" : " [warn-only exit]"}`
  );

  if (strict && fails > 0) process.exit(1);
  if (!strict) process.exit(0);
  process.exit(fails > 0 ? 1 : 0);
}

await main();
