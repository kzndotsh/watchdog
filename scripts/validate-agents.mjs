#!/usr/bin/env node
/**
 * Validates Agent Skills (SKILL.md) committed under .agents/skills/ and
 * nested package/app .agents/skills/ dirs, plus the .cursor/README.md sync
 * gate. Separate from scripts/check-agents.mjs, which owns AGENTS.md prose
 * hygiene — this script owns the portable-skills layer.
 *
 * Modeled on cursor/plugin-template's validate-template.mjs (per-artifact
 * required-key table, safe-path check, duplicate-name Set, missing-file vs
 * invalid-content distinction, error/warning arrays with one summarize-and-
 * exit) but uses a real YAML parser instead of a line-by-line splitter, so
 * multi-line block scalars and nested maps parse correctly.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { parse as parseYaml } from "yaml";

import {
  changedPaths,
  git,
  lines,
  resolvePushRange,
} from "./lib/git-range.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");

const TOP_LEVEL_KEYS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  // Claude Code keys (https://code.claude.com/docs/en/skills):
  "allowed-tools",
  "argument-hint",
  "disable-model-invocation",
  "model",
  "user-invocable",
]);
const METADATA_KEYS = new Set(["owner", "sources"]);
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TRIGGER_RE = /\b(use when|use for|trigger(?:s)? on)\b/i;
// Anthropic's skill guidance: keep SKILL.md under 500 lines, split the rest into sibling files.
const LINE_WARN = 400;
const LINE_FAIL = 500;

/**
 * Skills named in skills-lock.json are vendored: installed by the `skills` CLI
 * and pinned by content hash, so only Agent Skills spec rules apply to them.
 * House rules (owner/sources, trigger clause, line budget, staleness) apply to
 * skills this repo owns.
 * @returns {Promise<Record<string, unknown>>} lock entries by skill name
 */
async function readLockedSkills() {
  const lockPath = path.join(repoRoot, "skills-lock.json");
  if (!existsSync(lockPath)) return {};
  const lock = asRecord(JSON.parse(await readFile(lockPath, "utf-8")));
  return asRecord(lock.skills);
}

/**
 * Content hash of a skill folder, matching `computedHash` in skills-lock.json.
 * Same scheme as the `skills` CLI (computeSkillFolderHash, verified against all
 * 27 pinned skills): sha256 over every file under the folder (skipping `.git`
 * and `node_modules`), sorted by forward-slash relative path with
 * `String.prototype.localeCompare`, feeding each file's relative path and then
 * its raw bytes into one running hash.
 * @param {string} skillDir
 * @returns {Promise<string>}
 */
async function computeSkillFolderHash(skillDir) {
  /** @type {{ relativePath: string; content: Buffer }[]} */
  const files = [];
  /** @param {string} dir */
  async function collect(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === ".git" || entry.name === "node_modules") return;
          await collect(full);
        } else if (entry.isFile()) {
          files.push({
            relativePath: path
              .relative(skillDir, full)
              .split(path.sep)
              .join("/"),
            content: await readFile(full),
          });
        }
      })
    );
  }
  await collect(skillDir);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update(file.content);
  }
  return hash.digest("hex");
}

const changed = resolveChangedPaths();

/** @type {{ level: "warn" | "fail"; msg: string }[]} */
const findings = [];
/** @param {"warn" | "fail"} level @param {string} msg */
function note(level, msg) {
  findings.push({ level, msg });
}

/** @param {string} rel */
function isSafeRelativePath(rel) {
  if (!rel || path.isAbsolute(rel)) return false;
  return !path.normalize(rel).split(path.sep).includes("..");
}

/** @param {string} raw */
function splitFrontmatter(raw) {
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return null;
  return {
    fmText: raw.slice(3, end).trim(),
    body: raw.slice(end + 4).replace(/^\n/, ""),
  };
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainObject(value) {
  return typeof value === "object" && value !== null;
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function asRecord(value) {
  return isPlainObject(value) ? value : {};
}

/** @param {string} fmText @returns {Record<string, unknown>} */
function parseFrontmatter(fmText) {
  return asRecord(parseYaml(fmText));
}

/**
 * Skill dirs to check: top-level .agents/skills/* plus one level of nesting
 * under packages/*\/.agents/skills/* and apps/*\/.agents/skills/*.
 */
async function discoverSkillRoots() {
  const roots = [];
  const topLevel = path.join(repoRoot, ".agents/skills");
  if (existsSync(topLevel)) roots.push(topLevel);

  const nestedTops = ["packages", "apps"].filter((top) =>
    existsSync(path.join(repoRoot, top))
  );
  const nestedNames = await Promise.all(
    nestedTops.map(async (top) => readdir(path.join(repoRoot, top)))
  );
  for (const [i, top] of nestedTops.entries()) {
    for (const name of nestedNames[i] ?? []) {
      const nested = path.join(repoRoot, top, name, ".agents/skills");
      if (existsSync(nested)) roots.push(nested);
    }
  }
  return roots;
}

/** @param {string} root */
async function listSkillDirs(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter(
      (e) =>
        e.isDirectory() && !e.name.startsWith("_") && !e.name.startsWith(".")
    )
    .map((e) => path.join(root, e.name));
}

/**
 * @param {string} name e.g. "--range"
 * @returns {string | undefined} the value of `--name=value`
 */
function flagValue(name) {
  return process.argv
    .find((a) => a.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/**
 * Paths changed in the diff the staleness check looks at (repo-relative, forward slashes).
 *   --staged       the index (pre-commit)
 *   --range=<r>    a committed range, e.g. origin/main...HEAD (CI: PR base or push)
 *   (default)      the working tree against HEAD, plus untracked files
 *   --before=<sha> --after=<sha>   a pushed range (CI push); an empty or all-zero
 *                  before falls back to the merge base with main
 * An unresolvable range FAILS the gate (exit 1): staleness is never skipped silently.
 * @returns {Set<string>}
 */
function resolveChangedPaths() {
  const range = flagValue("--range");
  const before = flagValue("--before");
  const after = flagValue("--after");
  try {
    if (range) return new Set(changedPaths([range], repoRoot));
    if (before !== undefined || after !== undefined) {
      const pushed = resolvePushRange({ before, after }, repoRoot);
      return new Set(
        changedPaths([`${pushed.start}..${pushed.after}`], repoRoot)
      );
    }
    if (process.argv.includes("--staged")) {
      return new Set(changedPaths(["--cached"], repoRoot));
    }
    return new Set([
      ...changedPaths(["HEAD"], repoRoot),
      ...lines(git(["ls-files", "--others", "--exclude-standard"], repoRoot)),
    ]);
  } catch (error) {
    console.error(
      `FAIL  validate:agents: cannot determine the changed paths for the staleness check: ${error instanceof Error ? error.message : String(error)}`
    );
    return process.exit(1);
  }
}

/** @param {Set<string>} paths @param {string} rel */
function touches(paths, rel) {
  const prefix = rel.endsWith("/") ? rel : `${rel}/`;
  return [...paths].some((c) => c === rel || c.startsWith(prefix));
}

/**
 * @param {string} skillDir
 * @param {Map<string, string[]>} namesSeen
 * @param {Record<string, unknown>} locked
 */
async function checkSkill(skillDir, namesSeen, locked) {
  const folder = path.basename(skillDir);
  const rel = path.relative(repoRoot, skillDir);
  const skillMd = path.join(skillDir, "SKILL.md");

  if (!existsSync(skillMd)) {
    note("fail", `${rel}: missing SKILL.md`);
    return;
  }

  const raw = await readFile(skillMd, "utf-8");
  const totalLines = raw.split("\n").length;
  const fm = splitFrontmatter(raw);
  if (!fm) {
    note("fail", `${rel}/SKILL.md: missing or unterminated YAML frontmatter`);
    return;
  }

  let parsed;
  try {
    parsed = parseFrontmatter(fm.fmText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    note("fail", `${rel}/SKILL.md: invalid YAML frontmatter — ${message}`);
    return;
  }

  for (const key of Object.keys(parsed)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      note("fail", `${rel}/SKILL.md: orphan frontmatter key "${key}"`);
    }
  }

  const name = parsed.name;
  if (typeof name !== "string" || name.length === 0 || name.length > 64) {
    note("fail", `${rel}/SKILL.md: "name" must be 1-64 chars`);
  } else if (!NAME_RE.test(name)) {
    note(
      "fail",
      `${rel}/SKILL.md: "name" must be lowercase letters/numbers/hyphens, no leading/trailing/consecutive hyphens`
    );
  } else if (name === folder) {
    const dirs = namesSeen.get(name) ?? [];
    dirs.push(rel);
    namesSeen.set(name, dirs);
  } else {
    note(
      "fail",
      `${rel}/SKILL.md: name "${name}" must equal folder name "${folder}"`
    );
  }

  const isVendored = Object.hasOwn(locked, folder);

  const description = parsed.description;
  if (typeof description === "string" && description.trim().length > 0) {
    if (description.length > 1024) {
      note("fail", `${rel}/SKILL.md: "description" exceeds 1024 chars`);
    }
    if (!isVendored && !TRIGGER_RE.test(description)) {
      note(
        "warn",
        `${rel}/SKILL.md: "description" has no trigger clause ("Use when…" / "Use for…" / "Triggers on…")`
      );
    }
  } else {
    note(
      "fail",
      `${rel}/SKILL.md: "description" is required and must be non-empty`
    );
  }

  if (isVendored) {
    const pin = asRecord(locked[folder]);
    if ((await computeSkillFolderHash(skillDir)) !== pin.computedHash) {
      note(
        "fail",
        `${rel}: content does not match skills-lock.json (vendored skills must not be edited by hand). Reinstall: npx skills add ${String(pin.source)} --skill ${folder}`
      );
    }
    return;
  }

  checkMetadata(parsed.metadata, rel);

  if (totalLines > LINE_FAIL) {
    note(
      "fail",
      `${rel}/SKILL.md: ${totalLines} lines exceeds the ${LINE_FAIL}-line budget`
    );
  } else if (totalLines > LINE_WARN) {
    note(
      "warn",
      `${rel}/SKILL.md: ${totalLines} lines exceeds the soft ${LINE_WARN}-line threshold (fails above ${LINE_FAIL})`
    );
  }

  await checkReferences(skillDir, rel);
}

/**
 * @param {unknown} metadata
 * @param {string} rel
 */
function checkMetadata(metadata, rel) {
  if (!isPlainObject(metadata)) {
    note(
      "fail",
      `${rel}/SKILL.md: "metadata.owner" and "metadata.sources" are required`
    );
    return;
  }

  for (const key of Object.keys(metadata)) {
    if (!METADATA_KEYS.has(key)) {
      note("fail", `${rel}/SKILL.md: orphan metadata key "${key}"`);
    }
  }
  if (metadata.owner !== "watchdog") {
    note("fail", `${rel}/SKILL.md: "metadata.owner" must be "watchdog"`);
  }

  const sources = metadata.sources;
  if (typeof sources !== "string" || sources.trim().length === 0) {
    note(
      "fail",
      `${rel}/SKILL.md: "metadata.sources" must be a non-empty comma-separated string`
    );
    return;
  }

  const sourcePaths = sources
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const srcRel of sourcePaths) {
    if (!isSafeRelativePath(srcRel)) {
      note("fail", `${rel}/SKILL.md: unsafe source path "${srcRel}"`);
      continue;
    }
    const srcAbs = path.join(repoRoot, srcRel);
    if (!existsSync(srcAbs)) {
      note(
        "fail",
        `${rel}/SKILL.md: metadata.sources path does not exist: ${srcRel}`
      );
      continue;
    }
    // Diff-based: a source changed in this diff while the skill's own files did not.
    if (touches(changed, srcRel) && !touches(changed, rel)) {
      note(
        "warn",
        `${rel}/SKILL.md: may be stale — ${srcRel} changed in this diff but the skill did not`
      );
    }
  }
}

/** @param {string} skillDir @param {string} rel */
async function checkReferences(skillDir, rel) {
  const refDir = path.join(skillDir, "references");
  if (!existsSync(refDir)) return;

  const entries = await readdir(refDir, { withFileTypes: true });
  const refFiles = entries.filter(
    (e) => e.isFile() && e.name !== "_template.md" && !e.name.startsWith("_")
  );
  const texts = await Promise.all(
    refFiles.map(async (e) => readFile(path.join(refDir, e.name), "utf-8"))
  );
  for (const [i, entry] of refFiles.entries()) {
    if (!/load this when/i.test(texts[i] ?? "")) {
      note(
        "warn",
        `${rel}/references/${entry.name}: missing an explicit "Load this when:" trigger line`
      );
    }
  }
}

async function checkReadmeSync() {
  const readmePath = path.join(repoRoot, ".cursor/README.md");
  if (!existsSync(readmePath)) {
    note(
      "warn",
      ".cursor/README.md is missing — add it to document hooks and skills"
    );
    return;
  }
  const text = await readFile(readmePath, "utf-8");
  const pkgRaw = await readFile(path.join(repoRoot, "package.json"), "utf-8");
  const pkgJson = asRecord(JSON.parse(pkgRaw));
  const scripts = asRecord(pkgJson.scripts);

  for (const m of text.matchAll(/`pnpm ([a-zA-Z0-9:_-]+)`/g)) {
    const scriptName = m[1] ?? "";
    if (!(scriptName in scripts)) {
      note(
        "fail",
        `.cursor/README.md references "pnpm ${scriptName}", not in package.json scripts`
      );
    }
  }

  for (const m of text.matchAll(
    /`(\.cursor\/[^`]+|scripts\/[^`]+|\.agents\/[^`]+)`/g
  )) {
    const refRel = (m[1] ?? "").split("#")[0]?.trim() ?? "";
    if (!refRel || refRel.endsWith("/")) continue;
    if (!isSafeRelativePath(refRel)) {
      note("fail", `.cursor/README.md references unsafe path "${refRel}"`);
      continue;
    }
    if (!existsSync(path.join(repoRoot, refRel))) {
      note("fail", `.cursor/README.md references missing path "${refRel}"`);
    }
  }
}

async function main() {
  const roots = await discoverSkillRoots();
  const dirLists = await Promise.all(roots.map(async (r) => listSkillDirs(r)));
  const skillDirs = dirLists.flat();

  if (skillDirs.length === 0) {
    note(
      "fail",
      "no skills discovered — check the walk paths in validate-agents.mjs"
    );
  }

  /** @type {Map<string, string[]>} */
  const namesSeen = new Map();
  const locked = await readLockedSkills();
  await Promise.all(
    skillDirs.map(async (dir) => checkSkill(dir, namesSeen, locked))
  );
  for (const [name, dirs] of namesSeen) {
    if (dirs.length > 1) {
      note(
        "warn",
        `skill name "${name}" used in multiple dirs: ${dirs.join(", ")}`
      );
    }
  }

  await checkReadmeSync();

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
    `validate:agents: checked ${skillDirs.length} skill(s), ${findings.length} finding(s) (${fails} fail, ${warns} warn)`
  );

  process.exit(fails > 0 ? 1 : 0);
}

await main();
