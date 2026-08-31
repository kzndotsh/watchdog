#!/usr/bin/env node
/**
 * New hand-owned atom checklist (HashiCorp-style).
 * Replaces treating `wd-ui-files.mjs` as a bare filename list.
 *
 * Usage:
 *   node scripts/new-atom-checklist.mjs <AtomName> <relative-path-under-src/shared/ui>
 *
 * Exit 0 only when COMPONENTS.md, wd-ui-files.mjs, and /ui fixture mention the atom.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const [atomName, relPath] = process.argv.slice(2);

if (!atomName || !relPath) {
  console.error(
    "Usage: node scripts/new-atom-checklist.mjs <AtomName> <path-under-src/shared/ui>"
  );
  console.error(
    "Example: node scripts/new-atom-checklist.mjs FormInlineError form-inline-message.tsx"
  );
  process.exit(2);
}

const fileRel = relPath.startsWith("src/")
  ? relPath
  : `src/shared/ui/${relPath.replace(/^\/+/, "")}`;
const abs = path.join(root, fileRel);

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
 * @returns {string[]}
 */
function walkUi(dir) {
  /** @type {string[]} */
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...walkUi(p));
    } else if (ent.name.endsWith(".tsx") || ent.name.endsWith(".ts")) {
      out.push(p);
    }
  }
  return out;
}

console.log(`\nNew atom checklist: ${atomName} → ${fileRel}\n`);

if (existsSync(abs)) {
  ok("Source file exists");
} else {
  fail(`Source file missing: ${fileRel}`);
}

const manifest = readFileSync(
  path.join(root, "scripts/wd-ui-files.mjs"),
  "utf-8"
);
if (manifest.includes(`"${fileRel}"`) || manifest.includes(`'${fileRel}'`)) {
  ok("Listed in wd-ui-files.mjs");
} else {
  fail(`Not listed in scripts/wd-ui-files.mjs — add the path`);
}

const componentsDoc = path.join(root, "../../docs/reference/web/components.md");
if (existsSync(componentsDoc)) {
  const doc = readFileSync(componentsDoc, "utf-8");
  if (doc.includes(`\`${atomName}\``) || doc.includes(atomName)) {
    ok("COMPONENTS.md registry mentions atom");
  } else {
    fail(
      `No COMPONENTS.md registry row for ${atomName} (purpose / when-not-to / alternative / tokens)`
    );
  }
} else {
  fail("docs/reference/web/components.md missing");
}

const uiDir = path.join(root, "src/routes/_protected/ui");
if (existsSync(uiDir)) {
  const uiText = walkUi(uiDir)
    .map((f) => readFileSync(f, "utf-8"))
    .join("\n");
  if (uiText.includes(atomName)) {
    ok("/ui fixture specimen present");
  } else {
    fail(`/ui fixture must include a specimen referencing ${atomName}`);
  }
} else {
  fail("Missing /ui fixture route");
}

console.log(`
Also confirm manually:
  • purpose + when-not-to-use documented
  • named alternative listed
  • tokens bound to semantic/domain classes (no freestyle palette)
  • no I/O inside shared/ui (options/data passed in)
  • extract justified by ≥2 call sites
`);

if (failed) {
  console.error("\nnew-atom-checklist failed — atom is not done");
  process.exit(1);
}
console.log("\nnew-atom-checklist passed");
