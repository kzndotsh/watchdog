#!/usr/bin/env node
/**
 * Migration drift gate: the TypeScript schema is the source of truth, so running
 * `drizzle-kit generate` against a checkout must produce nothing. If it writes a new
 * migration or changes a snapshot or the journal, a table definition changed without
 * its migration. The generated files are rolled back after the check, so the working
 * tree is left as it was.
 *
 * `generate` reads the schema files only (no database connection); drizzle.config.ts
 * still insists on a DATABASE_URL, so a placeholder is supplied when none is set.
 *
 *   node scripts/check-migrations.mjs
 *
 * Test seam: WD_MIGRATIONS_GENERATE_CMD replaces the generate command.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "packages/db/drizzle");
const GENERATE_CMD =
  process.env.WD_MIGRATIONS_GENERATE_CMD ??
  "pnpm --filter @watchdog/db generate --name=migration_drift_check";

/**
 * @param {string} dir
 * @returns {Map<string, Buffer>} relative path to content
 */
function snapshot(dir) {
  /** @type {Map<string, Buffer>} */
  const files = new Map();
  if (!existsSync(dir)) return files;
  /** @param {string} current */
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) walk(abs);
      else files.set(path.relative(dir, abs), readFileSync(abs));
    }
  };
  walk(dir);
  return files;
}

const before = snapshot(outDir);

const res = spawnSync(GENERATE_CMD, {
  cwd: root,
  shell: true,
  encoding: "utf-8",
  env: {
    ...process.env,
    DATABASE_URL:
      process.env.DATABASE_URL ?? "postgresql://x:x@127.0.0.1:5432/x",
  },
});

const after = snapshot(outDir);

/** @type {string[]} */
const drift = [];
for (const [rel, content] of after) {
  const prior = before.get(rel);
  if (prior === undefined) drift.push(`added    ${rel}`);
  else if (!prior.equals(content)) drift.push(`modified ${rel}`);
}
for (const rel of before.keys()) {
  if (!after.has(rel)) drift.push(`removed  ${rel}`);
}

// Roll back whatever generate wrote, so the check never leaves files behind.
for (const rel of after.keys()) {
  if (!before.has(rel)) rmSync(path.join(outDir, rel), { force: true });
}
for (const [rel, content] of before) {
  if (!after.get(rel)?.equals(content)) {
    mkdirSync(path.dirname(path.join(outDir, rel)), { recursive: true });
    writeFileSync(path.join(outDir, rel), content);
  }
}

if (res.status !== 0) {
  process.stderr.write(`${res.stdout}${res.stderr}`);
  console.error(
    `check:migrations: generate failed (exit ${res.status ?? "signal"})`
  );
  process.exit(1);
}

if (drift.length > 0) {
  console.error(
    "check:migrations: the schema has changed without a migration:"
  );
  for (const line of drift) console.error(`  ${line}`);
  console.error(
    "Run `pnpm db:generate --name=<what_changed>` and commit the migration and its meta snapshot. Never edit a released migration."
  );
  process.exit(1);
}

console.log("check:migrations: ok (schema and migrations agree)");
