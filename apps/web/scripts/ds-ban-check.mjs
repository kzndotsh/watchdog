#!/usr/bin/env node
/**
 * Design-system ban check. Every rule states what it prevents; the full
 * inventory (taste vs correctness, verdicts) is docs/reference/web/ui/rules.md.
 *
 * Correctness (bugs we've shipped or can't see in review):
 *   - opaque-id .slice        truncated ids collide and can't be searched
 *   - fictional vocab         values not in @watchdog/schemas unions render as lies
 *   - loading doctrine        waterfalls, double pending surfaces, a11y-less loaders
 * Consistency (one way to do a thing):
 *   - SectionLabel SoT, WD UI manifest + /ui fixtures
 * Taste (the design brief, docs/explanation/design.md):
 *   - radius ladder, decorative effects, banned surface names
 *
 * Tailwind class checks (raw palette colors, undeclared tokens, arbitrary values,
 * unknown classes) live in @shadcn/lint via oxlint.config.ts.
 *
 * Escape hatch: `// ds:allow-<rule> — reason` on the line above.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

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
    if (name === "shadcn" || name === "node_modules") continue;
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

/** @param {string} abs */
function relFromRoot(abs) {
  return path.relative(root, abs).replaceAll("\\", "/");
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

/**
 * @param {string} text
 * @returns {boolean}
 */
function loaderAwaitedPromiseAll(text) {
  const lines = text.split("\n");
  let inLoader = false;
  let braceDepth = 0;
  let started = false;

  for (const line of lines) {
    if (!inLoader && /\bloader\s*:/.test(line)) {
      inLoader = true;
      braceDepth = 0;
      started = false;
    }
    if (!inLoader) continue;

    for (const ch of line) {
      if (ch === "{") {
        braceDepth += 1;
        started = true;
      } else if (ch === "}") {
        braceDepth -= 1;
      }
    }

    if (started && /await\s+Promise\.all\s*\(/.test(line)) {
      return true;
    }

    if (started && braceDepth === 0) {
      inLoader = false;
    }
  }
  return false;
}

// ── 1. Single SectionLabel SoT ───────────────────────────────────────────────
const sectionDefs = walk(path.join(src, "shared")).filter((f) => {
  const text = readFileSync(f, "utf-8");
  return (
    /export function SectionLabel\b/.test(text) ||
    /export const SectionLabel\b/.test(text)
  );
});
const allowedSection = "shared/ui/section-label.tsx";
for (const f of sectionDefs) {
  const r = rel(f);
  if (r !== allowedSection) {
    fail(`SectionLabel defined in ${r} — only ${allowedSection} may define it`);
  }
}
if (sectionDefs.some((f) => rel(f) === allowedSection)) {
  ok("SectionLabel SoT = shared/ui/section-label.tsx");
} else {
  fail("SectionLabel missing under shared/ui/section-label.tsx");
}

// Raw palette colors, arbitrary font sizes / values, and undeclared tokens are
// enforced by @shadcn/lint (oxlint.config.ts), not here.

// ── 2e. Radius ladder — sm / md / lg only ────────────────────────────────────
const ROUNDED_RE = /\brounded(?:-[trblse]{1,2})?-(?:xl|2xl|3xl|4xl)\b/;
// ── 2f. Decorative effects from the refuse list ──────────────────────────────
// Why: gradients, gradient text, and glass read as template chrome.
const DECORATIVE_RE =
  /\b(?:bg-gradient-to-|bg-linear-|bg-radial|bg-conic|bg-clip-text|backdrop-blur)/;

/** @type {{ rule: string; re: RegExp; msg: string }[]} */
const TASTE_BANS = [
  {
    rule: "radius",
    re: ROUNDED_RE,
    msg: "rounded-xl+ — radius ladder is sm / md / lg",
  },
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
    if (r.startsWith("shared/ui/shadcn/") || r.startsWith("auth/ui/")) continue;
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

// ── 4. Fictional vocab literals ──────────────────────────────────────────────
const FICTION_RE =
  /confidence=["']probable["']|status=["'](?:active|dormant|merged)["']|--confidence-probable|--status-active\b|--status-dormant\b|--status-merged\b/;
const fictionHits = [];
for (const f of walk(src)) {
  const r = rel(f);
  if (r.startsWith("shared/ui/shadcn/")) continue;
  const lines = readFileSync(f, "utf-8").split("\n");
  for (const [i, line] of lines.entries()) {
    if (line.trimStart().startsWith("//")) continue;
    if (FICTION_RE.test(line)) {
      fictionHits.push(`${r}:${i + 1}: ${line.trim()}`);
    }
  }
}
for (const hit of fictionHits) {
  fail(`Fictional vocab / token (use schemas unions): ${hit}`);
}
if (fictionHits.length === 0) {
  ok("No probable/active/dormant/merged fiction literals");
}

// ── 5. Bidirectional WD UI manifest ──────────────────────────────────────────
/**
 * @param {unknown} value
 * @returns {value is { WD_UI_FILES: string[]; WD_UI_FIXTURE_REQUIRED: string[] }}
 */
function hasWdUiFiles(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "WD_UI_FILES" in value &&
    Array.isArray(value.WD_UI_FILES) &&
    value.WD_UI_FILES.every((f) => typeof f === "string") &&
    "WD_UI_FIXTURE_REQUIRED" in value &&
    Array.isArray(value.WD_UI_FIXTURE_REQUIRED)
  );
}

/** @type {unknown} */
const wdUiFilesModule = await import(
  pathToFileURL(path.join(root, "scripts/wd-ui-files.mjs")).href
);
if (!hasWdUiFiles(wdUiFilesModule)) {
  throw new TypeError(
    "scripts/wd-ui-files.mjs must export WD_UI_FILES + WD_UI_FIXTURE_REQUIRED"
  );
}
const { WD_UI_FILES, WD_UI_FIXTURE_REQUIRED } = wdUiFilesModule;

const manifestSet = new Set(WD_UI_FILES.map((f) => f.replaceAll("\\", "/")));
for (const f of WD_UI_FILES) {
  if (!existsSync(path.join(root, f))) fail(`WD UI missing: ${f}`);
}

const onDisk = walk(path.join(src, "shared/ui"))
  .map((abs) => relFromRoot(abs))
  .filter(
    (r) =>
      !r.includes("/shadcn/") &&
      !r.includes("/__tests__/") &&
      !r.endsWith(".lib.ts")
  );
for (const f of onDisk) {
  if (!manifestSet.has(f)) {
    fail(
      `Hand-owned UI file not in wd-ui-files.mjs (add + COMPONENTS.md row): ${f}`
    );
  }
}
ok(
  `WD UI bidirectional manifest (${WD_UI_FILES.length} listed, ${onDisk.length} on disk)`
);

// ── 6. /ui fixture coverage for required atoms ───────────────────────────────
const uiDir = path.join(src, "routes/_protected/ui");
if (existsSync(uiDir)) {
  const uiText = walk(uiDir)
    .map((f) => readFileSync(f, "utf-8"))
    .join("\n");
  for (const name of WD_UI_FIXTURE_REQUIRED) {
    if (!uiText.includes(name)) {
      fail(`/ui fixture missing required atom specimen: ${name}`);
    }
  }
  ok(`/ui fixture covers ${WD_UI_FIXTURE_REQUIRED.length} required atoms`);
} else {
  fail("Missing /ui fixture route dir: routes/_protected/ui/");
}

// ── 7. Loading doctrine bans (see docs/reference/web/ui/loading.md) ────
const ROUTE_PENDING_IMPORT_RE =
  /from\s+["']@\/shared\/layout\/route-pending["']/;
const SHADCN_SKELETON_IMPORT_RE =
  /from\s+["']@\/shared\/ui\/shadcn\/skeleton["']/;
const USE_SUSPENSE_QUERY_CALL_RE = /\buseSuspenseQuery\s*\(/;

const routePendingHits = [];
for (const f of walk(path.join(src, "routes"))) {
  const r = rel(f);
  const lines = readFileSync(f, "utf-8").split("\n");
  for (const [i, line] of lines.entries()) {
    if (line.trimStart().startsWith("//")) continue;
    if (!ROUTE_PENDING_IMPORT_RE.test(line)) continue;
    if (consumeAllow(lines, i, "route-pending")) continue;
    routePendingHits.push(`${r}:${i + 1}`);
  }
}
for (const hit of routePendingHits) {
  fail(
    `RoutePending import in routes/ — shell-first: in-page RegionBoundary + shape skeleton in the data slot instead. Exception: routes with ssr:false or ssr:'data-only' need pendingComponent (or defaultPendingComponent); use // ds:allow-route-pending — reason: ${hit}`
  );
}
if (routePendingHits.length === 0) {
  ok("No RoutePending imports in routes/");
}

const domainSkeletonHits = [];
for (const f of walk(path.join(src, "domains"))) {
  const r = rel(f);
  const lines = readFileSync(f, "utf-8").split("\n");
  for (const [i, line] of lines.entries()) {
    if (line.trimStart().startsWith("//")) continue;
    if (!SHADCN_SKELETON_IMPORT_RE.test(line)) continue;
    if (consumeAllow(lines, i, "shadcn-skeleton")) continue;
    domainSkeletonHits.push(`${r}:${i + 1}`);
  }
}
for (const hit of domainSkeletonHits) {
  fail(
    `shadcn/skeleton import in domains/ — use PendingRegion / shared/ui/skeletons.tsx (QueueSkeleton, StackBodySkeleton, …). Tables: DataTable pending only (ui/tables.md): ${hit}`
  );
}
if (domainSkeletonHits.length === 0) {
  ok("No shadcn/skeleton imports in domains/");
}

const animatePulseHits = [];
for (const f of walk(src)) {
  const r = rel(f);
  if (r.startsWith("shared/ui/") || r.startsWith("auth/ui/")) continue;
  const lines = readFileSync(f, "utf-8").split("\n");
  for (const [i, line] of lines.entries()) {
    if (line.trimStart().startsWith("//")) continue;
    if (!/\banimate-pulse\b/.test(line)) continue;
    if (consumeAllow(lines, i, "animate-pulse")) continue;
    animatePulseHits.push(`${r}:${i + 1}: ${line.trim()}`);
  }
}
for (const hit of animatePulseHits) {
  fail(
    `animate-pulse outside shared/ui — use Skeleton from shared/ui/shadcn/skeleton (prefers-reduced-motion guard keys [data-slot=skeleton]): ${hit}`
  );
}
if (animatePulseHits.length === 0) {
  ok("No hand-rolled animate-pulse outside shared/ui");
}

const ariaBusyHits = [];
for (const f of walk(src)) {
  const r = rel(f);
  if (r.startsWith("shared/ui/") || r.includes("/__tests__/")) continue;
  const lines = readFileSync(f, "utf-8").split("\n");
  for (const [i, line] of lines.entries()) {
    if (line.trimStart().startsWith("//")) continue;
    if (!/\baria-busy\b/.test(line)) continue;
    if (consumeAllow(lines, i, "aria-busy")) continue;
    ariaBusyHits.push(`${r}:${i + 1}: ${line.trim()}`);
  }
}
for (const hit of ariaBusyHits) {
  fail(
    `aria-busy outside shared/ui — wrap loading regions in LoadingRegion (aria-busy + aria-hidden skeleton + role=status label): ${hit}`
  );
}
if (ariaBusyHits.length === 0) {
  ok("No hand-rolled aria-busy outside shared/ui");
}

const loaderPromiseAllHits = [];
for (const f of walk(path.join(src, "routes"))) {
  const r = rel(f);
  if (r.startsWith("routes/api/")) continue;
  const text = readFileSync(f, "utf-8");
  if (!/\bloader\s*:/.test(text)) continue;
  if (!loaderAwaitedPromiseAll(text)) continue;
  const lines = text.split("\n");
  let flaggedLine = 1;
  for (const [i, line] of lines.entries()) {
    if (/await\s+Promise\.all\s*\(/.test(line)) {
      flaggedLine = i + 1;
      break;
    }
  }
  if (consumeAllow(lines, flaggedLine - 1, "loader-promise-all")) continue;
  loaderPromiseAllHits.push(`${r}:${flaggedLine}`);
}
for (const hit of loaderPromiseAllHits) {
  fail(
    `await Promise.all in route loader — thin loader (identity only) + warm*Queries helper; parallel reads belong in components via useSuspenseQueries: ${hit}`
  );
}
if (loaderPromiseAllHits.length === 0) {
  ok("No awaited Promise.all in route loaders (excl. routes/api/)");
}

const suspenseWaterfallHits = [];
for (const f of walk(src)) {
  const r = rel(f);
  if (r.includes("/__tests__/")) continue;
  const lines = readFileSync(f, "utf-8").split("\n");
  let unallowedCalls = 0;
  for (const [i, line] of lines.entries()) {
    if (line.trimStart().startsWith("//")) continue;
    if (!USE_SUSPENSE_QUERY_CALL_RE.test(line)) continue;
    if (consumeAllow(lines, i, "use-suspense-query")) continue;
    unallowedCalls += 1;
  }
  if (unallowedCalls >= 2) {
    suspenseWaterfallHits.push(`${r} (${unallowedCalls} calls)`);
  }
}
for (const hit of suspenseWaterfallHits) {
  fail(
    `2+ useSuspenseQuery in one file — serial waterfalls; collapse to useSuspenseQueries (warm* parity is not enough on cold cache / SSR TTFB): ${hit}`
  );
}
if (suspenseWaterfallHits.length === 0) {
  ok("No useSuspenseQuery waterfalls (≤1 call per file)");
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
