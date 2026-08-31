#!/usr/bin/env node
/**
 * afterFileEdit hook: immediately re-validate AGENTS.md / .agents/skills/
 * edits. This hook has no output fields Cursor consumes — the `stop` hook
 * (stop-gate.mjs) is what surfaces failures back to the agent. This pass
 * exists to catch a broken skill or doc the moment it is introduced, cheap
 * and self-contained, independent of whatever else changed in the turn.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

/** @param {string} script @param {string[]} args */
function run(script, args) {
  if (!existsSync(script)) return;
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(
      `[validate-on-edit] ${path.basename(script)} failed:\n${result.stdout ?? ""}${result.stderr ?? ""}\n`
    );
  }
}

function main() {
  let input = {};
  try {
    const raw = readFileSync(0, "utf8");
    if (raw.trim()) input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const filePath = input.file_path ?? "";
  if (!filePath) process.exit(0);

  const rel = path.relative(root, filePath).replaceAll("\\", "/");

  if (rel.endsWith("AGENTS.md")) {
    run(path.join(root, "scripts/check-agents.mjs"), ["--strict"]);
  } else if (rel.includes(".agents/skills/") || rel === ".cursor/README.md") {
    run(path.join(root, "scripts/validate-agents.mjs"), []);
  } else if (rel.startsWith("docs/") || rel.startsWith("docs/reference/web/")) {
    run(path.join(root, "scripts/check-docs.mjs"), []);
  }

  process.exit(0);
}

main();
