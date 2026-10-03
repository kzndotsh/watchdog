#!/usr/bin/env node
import { spawnSync } from "node:child_process";
/**
 * Vendor lock for `packages/ui` (shadcn primitives, byte-identical to CLI output).
 *
 *   node scripts/ui-vendor.mjs check          offline: every vendored file matches vendor.json
 *   node scripts/ui-vendor.mjs sync           re-run the shadcn CLI for every component, re-lock
 *   node scripts/ui-vendor.mjs add <name..>   install component(s) via the CLI, re-lock
 *   node scripts/ui-vendor.mjs remove <name..> delete component(s), re-lock
 *   node scripts/ui-vendor.mjs init           one-time: lock what is on disk (refuses if locked)
 *
 * Why: hand edits to vendored files make every `shadcn add --overwrite`, codemod and
 * preset change a merge conflict. Watchdog-specific behavior lives in
 * apps/web/src/shared/ui/primitives (wrappers); this lock makes an accidental edit fail loudly.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pkg = path.join(root, "packages/ui");
const lockPath = path.join(pkg, "vendor.json");
/**
 * Exact shadcn CLI version every `sync`/`add` runs, so output is reproducible. It is
 * recorded in vendor.json and `check` fails if the two differ. Bump both together
 * (edit this, run `pnpm ui:sync`, review `git diff packages/ui`).
 */
const SHADCN_VERSION = "4.21.0";
/** Directories whose contents are owned by the shadcn CLI. */
const VENDORED_DIRS = ["src/components", "src/hooks"];

/** @param {string} abs */
function sha256(abs) {
  return `sha256:${createHash("sha256").update(readFileSync(abs)).digest("hex")}`;
}

function listVendored() {
  /** @type {Record<string, string>} */
  const files = {};
  for (const dir of VENDORED_DIRS) {
    const abs = path.join(pkg, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs).sort()) {
      if (!/\.(tsx?|css)$/.test(name)) continue;
      files[`${dir}/${name}`] = sha256(path.join(abs, name));
    }
  }
  return files;
}

/** @returns {{ style: string; shadcn: string | null; components: string[]; files: Record<string, string> } | null} */
function readLock() {
  if (!existsSync(lockPath)) return null;
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(lockPath, "utf-8"));
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !("components" in parsed) ||
    !Array.isArray(parsed.components) ||
    !("files" in parsed) ||
    parsed.files === null ||
    typeof parsed.files !== "object"
  ) {
    throw new TypeError("packages/ui/vendor.json is malformed");
  }
  const style =
    "style" in parsed && typeof parsed.style === "string"
      ? parsed.style
      : "base-mira";
  const shadcn =
    "shadcn" in parsed && typeof parsed.shadcn === "string"
      ? parsed.shadcn
      : null;
  /** @type {Record<string, string>} */
  const files = {};
  for (const [file, hash] of Object.entries(parsed.files)) {
    if (typeof hash === "string") files[file] = hash;
  }
  const components = parsed.components.filter((c) => typeof c === "string");
  return { style, shadcn, components, files };
}

/**
 * @param {string} style
 * @param {string[]} components
 */
function writeLock(style, components) {
  const sorted = [...new Set(components)].sort();
  writeFileSync(
    lockPath,
    `${JSON.stringify(
      {
        style,
        shadcn: SHADCN_VERSION,
        components: sorted,
        files: listVendored(),
      },
      null,
      2
    )}\n`
  );
}

function onDiskComponents() {
  return readdirSync(path.join(pkg, "src/components"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => f.replace(/\.tsx$/, ""));
}

/** @returns {string} */
function readStyle() {
  /** @type {unknown} */
  const cfg = JSON.parse(
    readFileSync(path.join(pkg, "components.json"), "utf-8")
  );
  if (
    cfg !== null &&
    typeof cfg === "object" &&
    "style" in cfg &&
    typeof cfg.style === "string"
  ) {
    return cfg.style;
  }
  return "base-mira";
}

/** @param {string[]} names */
function runCli(names) {
  const result = spawnSync(
    "pnpm",
    ["dlx", `shadcn@${SHADCN_VERSION}`, "add", ...names, "--overwrite", "-y"],
    { cwd: pkg, stdio: "inherit" }
  );
  if (result.status !== 0) {
    console.error("✗ shadcn CLI failed; vendor.json left unchanged");
    process.exit(result.status ?? 1);
  }
}

function check() {
  const lock = readLock();
  if (!lock) {
    console.error(
      "✗ packages/ui/vendor.json missing — run `ui-vendor.mjs init`"
    );
    process.exit(1);
  }
  const disk = listVendored();
  /** @type {string[]} */
  const problems = [];
  if (lock.shadcn !== SHADCN_VERSION) {
    problems.push(
      `shadcn CLI version: vendor.json records ${lock.shadcn ?? "none"} but ui-vendor.mjs pins ${SHADCN_VERSION}; re-run \`pnpm ui:sync\` after bumping the pin`
    );
  }
  for (const [file, hash] of Object.entries(lock.files)) {
    if (!(file in disk)) problems.push(`missing: ${file}`);
    else if (disk[file] !== hash) problems.push(`edited by hand: ${file}`);
  }
  for (const file of Object.keys(disk)) {
    if (!(file in lock.files)) problems.push(`not in lock: ${file}`);
  }
  if (problems.length > 0) {
    for (const p of problems) console.error(`✗ ${p}`);
    console.error(
      "\nVendored shadcn files are generated. Put Watchdog behavior in apps/web/src/shared/ui/primitives (wrappers) or CSS tokens; to update primitives run `pnpm ui:sync` / `pnpm ui:add <name>`."
    );
    process.exit(1);
  }
  console.log(
    `check:vendor: ok (${Object.keys(lock.files).length} vendored file(s), ${lock.style}, shadcn ${lock.shadcn})`
  );
}

const [cmd = "check", ...rest] = process.argv.slice(2);

if (cmd === "check") {
  check();
} else if (cmd === "init") {
  if (existsSync(lockPath)) {
    console.error("✗ vendor.json already exists; use `sync`");
    process.exit(1);
  }
  writeLock(readStyle(), onDiskComponents());
  console.log("vendor.json written");
} else if (cmd === "sync" || cmd === "add") {
  const lock = readLock();
  if (!lock) {
    console.error("✗ vendor.json missing — run `init` first");
    process.exit(1);
  }
  if (cmd === "add" && rest.length === 0) {
    console.error("usage: ui-vendor.mjs add <component..>");
    process.exit(1);
  }
  // The CLI transforms dependency-only installs differently from explicitly named ones
  // (e.g. it keeps "use client"), so output is only deterministic when every vendored
  // component is named. `add` therefore installs, then re-runs with everything on disk.
  if (cmd === "add") runCli(rest);
  runCli(onDiskComponents());
  writeLock(readStyle(), onDiskComponents());
  console.log(
    "vendor.json updated — review `git diff packages/ui`, then update wrappers if a component's API changed"
  );
} else if (cmd === "remove") {
  const lock = readLock();
  if (!lock || rest.length === 0) {
    console.error("usage: ui-vendor.mjs remove <component..>");
    process.exit(1);
  }
  for (const name of rest) {
    rmSync(path.join(pkg, `src/components/${name}.tsx`), { force: true });
  }
  writeLock(
    readStyle(),
    lock.components.filter((c) => !rest.includes(c))
  );
  console.log("removed; vendor.json updated");
} else {
  console.error(`unknown command: ${cmd}`);
  process.exit(1);
}
