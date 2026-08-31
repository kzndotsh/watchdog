#!/usr/bin/env node
/**
 * Gate for package/app AGENTS.md hygiene (Day-0 scope) + docs link smoke.
 * Default: warnings only. Pass --strict (or CHECK_AGENTS_STRICT=1) to fail CI.
 *
 * Vault dirs (staging/data/templates/tools/reports/graph) are out of scope.
 * Docs: recursive `docs/**` (+ `docs/reference/web/**` until merged) — broken relative
 * markdown links are fails. Prefer `pnpm check:docs` for anchors + AGENTS fail-level links.
 */
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const strict =
  process.argv.includes("--strict") || process.env.CHECK_AGENTS_STRICT === "1";

const HIGH_TRAFFIC_KIRO = [
  "packages/db",
  "packages/core",
  "packages/api",
  "packages/caps",
  "packages/env",
  "apps/web",
  "apps/worker",
];

const BANNED = [
  { re: /\bwd\s+promote\b/i, label: "wd promote" },
  { re: /\bDoor\s+A\b/, label: "Door A" },
  { re: /\bCandidate\s+theater\b/i, label: "Candidate theater" },
  { re: /\bScratch\b/, label: "Scratch" },
];

const MD_LINK = /\[([^\]]*)\]\(([^)]+)\)/g;
const REL_MD = /^(?:\.\.?\/|[\w.-]+\/)/;

/** @type {{ level: "warn" | "fail"; msg: string }[]} */
const findings = [];

/**
 * @param {"warn" | "fail"} level
 * @param {string} msg
 */
function note(level, msg) {
  findings.push({ level, msg });
}

/** @param {number} lineCount */
function isStub(lineCount) {
  return lineCount >= 6 && lineCount <= 15;
}

/** @param {string} text */
function countOutboundMdLinks(text) {
  let n = 0;
  for (const m of text.matchAll(MD_LINK)) {
    const href = m[2]?.split("#")[0]?.trim() ?? "";
    if (!href || href.startsWith("http") || href.startsWith("mailto:"))
      continue;
    if (REL_MD.test(href) || href.endsWith(".md") || href.includes("/")) n += 1;
  }
  return n;
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
  const target = path.resolve(path.dirname(fromFile), clean);
  return existsSync(target);
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

async function collectInScopeAgents() {
  /** @type {string[]} */
  const files = [];
  const rootAgents = path.join(repoRoot, "AGENTS.md");
  if (existsSync(rootAgents)) files.push(rootAgents);

  for (const rel of await listPackageAppDirs()) {
    const f = path.join(repoRoot, rel, "AGENTS.md");
    if (existsSync(f)) files.push(f);
  }
  return files;
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
        note(
          "warn",
          `${fileRel}:${i + 1}: banned mid-build term "${label}" (allowlist with <!-- check:agents allow-banned -->)`
        );
      }
    }
  }
}

/**
 * @param {string} fileRel
 * @param {string} text
 * @param {boolean} stub
 */
function checkDontDo(fileRel, text, stub) {
  if (stub) return;
  const hasDont =
    /\bDon'?t\b|\bNever\b|\bdo not\b|\bMUST NOT\b|🚫|\|\s*Don'?t\s*\|/i.test(
      text
    );
  const hasDo =
    /\bDo\b|\bInstead\b|\bAlways\b|✅|\|\s*Do\s*\|/i.test(text) ||
    /##\s+Boundaries/i.test(text) ||
    /##\s+Rules/i.test(text);
  if (hasDont && !hasDo) {
    note("warn", `${fileRel}: has don’ts without paired dos / Boundaries`);
  }
}

/** @param {string} absPath */
async function checkFile(absPath) {
  const rel = path.relative(repoRoot, absPath);
  const text = await readFile(absPath, "utf-8");
  const lines = text.split("\n");
  const lineCount = lines.length;
  const bytes = Buffer.byteLength(text, "utf-8");
  const isRoot = rel === "AGENTS.md";
  const stub = !isRoot && isStub(lineCount);

  if (bytes > 32 * 1024) {
    note("fail", `${rel}: exceeds 32 KiB (${bytes} bytes)`);
  }

  if (isRoot) {
    if (lineCount > 200) note("fail", `${rel}: root >200 lines (${lineCount})`);
    else if (lineCount > 140)
      note("warn", `${rel}: root >140 lines (${lineCount})`);
    if (!/##\s*(Quick reference|Commands)\b/i.test(text)) {
      note("warn", `${rel}: missing Quick reference / Commands section`);
    }
  } else {
    if (!stub && lineCount > 150) {
      note("fail", `${rel}: nested >150 lines (${lineCount})`);
    } else if (!stub && lineCount > 120) {
      note("warn", `${rel}: nested >120 lines (${lineCount})`);
    }
    if (!/^>\s*Scope:/m.test(text)) {
      note("warn", `${rel}: missing Scope blurb`);
    }
    if (!stub && !/##\s*Commands\b/i.test(text)) {
      note("warn", `${rel}: missing ## Commands (non-stub)`);
    }
  }

  const links = countOutboundMdLinks(text);
  if (links > 15) {
    note("warn", `${rel}: >15 relative markdown links (${links})`);
  }

  for (const m of text.matchAll(MD_LINK)) {
    const href = m[2]?.trim() ?? "";
    if (!href || href.startsWith("http") || href.startsWith("mailto:"))
      continue;
    if (href.startsWith("#")) continue;
    if (!resolveLink(absPath, href)) {
      note("warn", `${rel}: broken link → ${href}`);
    }
  }

  checkBanned(rel, text);
  checkDontDo(rel, text, stub);
}

async function checkPresence() {
  for (const rel of await listPackageAppDirs()) {
    const agents = path.join(repoRoot, rel, "AGENTS.md");
    if (!existsSync(agents)) {
      note("fail", `missing ${rel}/AGENTS.md`);
    }
  }
}

async function checkClaude() {
  const claude = path.join(repoRoot, "CLAUDE.md");
  if (!existsSync(claude)) {
    note("warn", "missing root CLAUDE.md (partner / Claude Code bridge)");
    return;
  }
  const text = await readFile(claude, "utf-8");
  if (!text.includes("@AGENTS.md")) {
    note("fail", "CLAUDE.md must reference @AGENTS.md");
  }

  const dirs = await listPackageAppDirs();
  await Promise.all(
    dirs.map(async (rel) => {
      const nested = path.join(repoRoot, rel, "CLAUDE.md");
      if (!existsSync(nested)) return;
      const body = await readFile(nested, "utf-8");
      const lines = body.split("\n").filter((l) => l.trim().length > 0);
      const onlyShim =
        lines.length <= 3 && body.includes("@AGENTS.md") && lines.length >= 1;
      if (onlyShim) {
        note("warn", `nested ${rel}/CLAUDE.md stub present — prefer root-only`);
      } else {
        note(
          "fail",
          `nested ${rel}/CLAUDE.md not allowed (use ≤3-line @AGENTS.md stub only if Phase 0 permits)`
        );
      }
    })
  );
}

async function checkKiro() {
  const steeringDir = path.join(repoRoot, ".kiro/steering");
  if (!existsSync(steeringDir)) {
    note("warn", "missing .kiro/steering/ (Day-0 fileMatch pointers)");
    return;
  }

  const steeringEntries = await readdir(steeringDir);
  const steeringNames = steeringEntries.filter((name) => name.endsWith(".md"));
  const steeringFiles = await Promise.all(
    steeringNames.map(async (name) => ({
      name,
      text: await readFile(path.join(steeringDir, name), "utf-8"),
    }))
  );

  for (const { name, text } of steeringFiles) {
    const always = /inclusion:\s*always/.test(text);
    const hasFileRef = /#\[\[file:[^\]]+AGENTS\.md\]\]/.test(text);
    const proseHeavy =
      text
        .split("\n")
        .filter((l) => l.trim() && !l.startsWith("---") && !l.startsWith("#"))
        .length > 12;
    if (always && proseHeavy && !hasFileRef) {
      note(
        "fail",
        `.kiro/steering/${name}: inclusion:always duplicates AGENTS prose — use #[[file:…/AGENTS.md]]`
      );
    } else if (always && proseHeavy) {
      note(
        "warn",
        `.kiro/steering/${name}: always-on steering still has substantial prose`
      );
    }
  }

  for (const pkg of HIGH_TRAFFIC_KIRO) {
    const agents = path.join(repoRoot, pkg, "AGENTS.md");
    if (!existsSync(agents)) continue;
    const found = steeringFiles.some(
      ({ text }) =>
        text.includes(`#[[file:${pkg}/AGENTS.md]]`) ||
        text.includes(`fileMatchPattern: "${pkg}/**"`)
    );
    if (!found) {
      note("warn", `Kiro: no fileMatch steering pointer for ${pkg}/AGENTS.md`);
    }
  }
}

/**
 * @param {string} dirAbs
 * @returns {Promise<string[]>}
 */
async function walkMdFiles(dirAbs) {
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
      .map(async (ent) => walkMdFiles(path.join(dirAbs, ent.name)))
  );
  const files = entries
    .filter((ent) => ent.isFile() && ent.name.endsWith(".md"))
    .map((ent) => path.join(dirAbs, ent.name));
  return [...files, ...nested.flat()];
}

async function collectDocFiles() {
  const dirs = ["docs"];
  const listings = await Promise.all(
    dirs.map(async (dirRel) => walkMdFiles(path.join(repoRoot, dirRel)))
  );
  return listings.flat();
}

/**
 * Warn on oversized durable doc leaves (fail only with --fail-docs-length / D6).
 * Prefer `pnpm check:docs` for the full budget gate.
 * @param {string} absPath
 */
async function checkDocLength(absPath) {
  const failLength = process.argv.includes("--fail-docs-length");
  const rel = path.relative(repoRoot, absPath);
  const text = await readFile(absPath, "utf-8");
  const n = text.split("\n").length;
  const allow =
    text.includes("<!-- docs:allow-length -->") ||
    rel === "docs/explanation/scenarios.md";
  if (allow) return;
  if (n > 250) {
    note(
      failLength ? "fail" : "warn",
      `${rel}: >250 lines (${n})${failLength ? "" : " [warn until docs D6]"}`
    );
  } else if (n > 180) {
    note("warn", `${rel}: >180 lines (${n})`);
  }
}

/**
 * Link smoke for platform + web docs (broken relative markdown links → fail in strict).
 * @param {string} absPath
 */
async function checkDocLinks(absPath) {
  const rel = path.relative(repoRoot, absPath);
  const text = await readFile(absPath, "utf-8");
  for (const m of text.matchAll(MD_LINK)) {
    const href = m[2]?.trim() ?? "";
    if (!href || href.startsWith("http") || href.startsWith("mailto:"))
      continue;
    if (href.startsWith("#")) continue;
    if (!resolveLink(absPath, href)) {
      note("fail", `${rel}: broken link → ${href}`);
    }
  }
}

async function main() {
  await checkPresence();
  await checkClaude();
  await checkKiro();

  const agentFiles = await collectInScopeAgents();
  await Promise.all(agentFiles.map(async (f) => checkFile(f)));

  const docFiles = await collectDocFiles();
  await Promise.all(
    docFiles.map(async (f) => {
      await checkDocLinks(f);
      await checkDocLength(f);
    })
  );

  const tradecraft = path.join(repoRoot, ".agents/tradecraft.md");
  if (existsSync(tradecraft)) {
    const text = await readFile(tradecraft, "utf-8");
    const n = text.split("\n").length;
    if (n > 300) note("fail", `.agents/tradecraft.md >300 lines (${n})`);
    else if (n > 200) note("warn", `.agents/tradecraft.md >200 lines (${n})`);
  }

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
    `check:agents: ${findings.length} finding(s) (${fails} fail, ${warns} warn)${strict ? " [strict]" : " [warn-only]"}`
  );

  if (strict && fails > 0) process.exit(1);
  if (!strict) process.exit(0);
  process.exit(fails > 0 ? 1 : 0);
}

await main();
