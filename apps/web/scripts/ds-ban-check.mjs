#!/usr/bin/env node
/**
 * Design-system ban check: the few taste/correctness rules a linter can't express
 * (class-string greps, exported names). Inventory and verdicts:
 * docs/reference/web/ui/rules.md.
 *
 *   - opaque-id .slice   truncated ids collide and can't be searched
 *   - decorative         gradients / glass (refuse list, DESIGN.md)
 *   - surface names      Console / Workbench / Tape (ui/README.md naming rule)
 *
 * Tailwind class checks (raw colors, undeclared tokens, arbitrary values, unknown
 * classes), primitive wrapper imports and loading-doctrine imports live in oxlint
 * (oxlint.config.ts).
 *
 * Escape hatch: `// ds:allow-<rule> — reason` on the line above.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const src = path.join(root, "src");

let failed = false;

function fail(msg) {
  console.error(`✗ ${msg}`);
  failed = true;
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

/**
 * @param {string} dir
 * @param {string[]} out
 * @returns {string[]}
 */
function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const abs = path.join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, out);
    else if (/\.(tsx|ts)$/.test(name)) out.push(abs);
  }
  return out;
}

/** @param {string} abs */
function rel(abs) {
  return path.relative(src, abs).replaceAll("\\", "/");
}

/** Escape hatch: `// ds:allow-<rule> — reason` on the line above a flagged line. */
const ALLOW_COMMENT_RE = /^\/\/\s*ds:allow-([\w-]+)\s*[—-]\s*.+/;

/** @type {number} */
let allowCount = 0;

/**
 * @param {string[]} lines
 * @param {number} lineIndex
 * @param {string} rule
 */
function isLineAllowed(lines, lineIndex, rule) {
  if (lineIndex <= 0) return false;
  const prev = lines[lineIndex - 1].trim();
  const m = ALLOW_COMMENT_RE.exec(prev);
  return m?.[1] === rule;
}

/**
 * @param {string[]} lines
 * @param {number} lineIndex
 * @param {string} rule
 * @returns {boolean}
 */
function consumeAllow(lines, lineIndex, rule) {
  if (isLineAllowed(lines, lineIndex, rule)) {
    allowCount += 1;
    return true;
  }
  return false;
}

// ── 2f. Decorative effects from the refuse list ──────────────────────────────
// Why: gradients, gradient text, and glass read as template chrome.
const DECORATIVE_RE =
  /\b(?:bg-gradient-to-|bg-linear-|bg-radial|bg-conic|bg-clip-text|backdrop-blur)/;

/** @type {{ rule: string; re: RegExp; msg: string }[]} */
const TASTE_BANS = [
  {
    rule: "decorative",
    re: DECORATIVE_RE,
    msg: "Gradient / gradient text / glass — refuse list",
  },
];
for (const { rule, re, msg } of TASTE_BANS) {
  const hits = [];
  for (const f of walk(src)) {
    const r = rel(f);
    if (r.startsWith("shared/ui/primitives/") || r.startsWith("auth/ui/"))
      continue;
    const lines = readFileSync(f, "utf-8").split("\n");
    for (const [i, line] of lines.entries()) {
      const t = line.trimStart();
      if (t.startsWith("//") || t.startsWith("*")) continue;
      if (!re.test(line)) continue;
      if (consumeAllow(lines, i, rule)) continue;
      hits.push(`${r}:${i + 1}: ${line.trim()}`);
    }
  }
  for (const hit of hits) fail(`${msg}: ${hit}`);
  if (hits.length === 0) ok(`No ${rule} violations`);
}

// ── 2g. Banned surface names (ui/README.md naming rule) ──────────────────────
// Why: v2 named every Queue + Detail screen after a new metaphor; the name told
// you nothing. Panel is allowed only in its standard meaning (reviewed by hand).
const SURFACE_NAME_RE =
  /export\s+(?:function|const)\s+(\w*(?:Console|Workbench|Tape))\b/;
const surfaceHits = [];
for (const f of walk(src)) {
  const r = rel(f);
  const lines = readFileSync(f, "utf-8").split("\n");
  for (const [i, line] of lines.entries()) {
    const m = SURFACE_NAME_RE.exec(line);
    if (!m) continue;
    if (consumeAllow(lines, i, "surface-name")) continue;
    surfaceHits.push(`${r}:${i + 1}: ${m[1]}`);
  }
}
for (const hit of surfaceHits) {
  fail(`Banned surface name (Console / Workbench / Tape): ${hit}`);
}
if (surfaceHits.length === 0) ok("No banned surface names");

// ── 3. Opaque id / sha256 display via .slice (all domains) ───────────────────
const ID_SLICE_RE =
  /\b(?:sha256|jobId|proposalId|entityId)\.slice\s*\(\s*0\s*,\s*\d+\s*\)|\.id\.slice\s*\(\s*0\s*,\s*\d+\s*\)|\bid\.slice\s*\(\s*0\s*,\s*\d+\s*\)/;

const sliceHits = [];
for (const f of walk(path.join(src, "domains"))) {
  const r = rel(f);
  const lines = readFileSync(f, "utf-8").split("\n");
  for (const [i, line] of lines.entries()) {
    if (line.trimStart().startsWith("//")) continue;
    if (
      /toISOString\(\)\.slice|capturedAt\.slice|processedAt\.slice|createdAt\.slice|when\.trim/.test(
        line
      )
    ) {
      continue;
    }
    if (ID_SLICE_RE.test(line)) {
      sliceHits.push(`${r}:${i + 1}: ${line.trim()}`);
    }
  }
}
for (const hit of sliceHits) {
  fail(`Opaque id/hash via .slice — use IdChip / formatOpaqueId: ${hit}`);
}
if (sliceHits.length === 0) {
  ok("No banned opaque-id .slice in domains/");
}

if (allowCount > 0) {
  ok(`${allowCount} ds:allow escape hatch(es) in use`);
} else {
  ok("No ds:allow escape hatches in use");
}

if (failed) {
  console.error("\nds-ban-check failed");
  process.exit(1);
}
console.log("\nds-ban-check passed");
