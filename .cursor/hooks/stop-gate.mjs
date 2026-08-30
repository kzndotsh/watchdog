#!/usr/bin/env node
/**
 * stop hook: fast, changed-files-only self-correction gate. Pre-push/CI own
 * the full typecheck and test suites — this only re-checks what the agent
 * just touched, via local binaries (no `pnpm` shell resolution), so the
 * fix -> rerun loop stays sub-second. Replaces the retired ds-ban-stop.mjs,
 * which duplicated pre-push's full `tsc` run.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const oxlintBin = path.join(root, "node_modules/.bin/oxlint");

/** @param {Record<string, unknown>} obj */
function respond(obj) {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}

function readInput() {
  try {
    const raw = readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** @param {import("node:child_process").SpawnSyncReturns<string>} result */
function formatSpawn(result) {
  const chunks = [
    result.stdout ?? "",
    result.stderr ?? "",
    result.error ? String(result.error.message ?? result.error) : "",
    result.status === null && !result.error ? "process failed to start" : "",
  ];
  return chunks.filter(Boolean).join("\n");
}

/** @param {string} text */
function clip(text) {
  const t = text.trim();
  return t.length > 3500 ? `${t.slice(0, 3500)}\n…` : t || "(no output)";
}

function changedFiles() {
  try {
    const out = execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
    });
    return out
      .split("\n")
      .map((line) => line.slice(3).trim())
      .filter(Boolean)
      .map((entry) => (entry.includes(" -> ") ? entry.split(" -> ")[1] : entry));
  } catch {
    return [];
  }
}

function main() {
  const input = readInput();
  if (input.status === "aborted" || input.status === "error") respond({});
  if ((input.loop_count ?? 0) >= 2) respond({});

  const files = changedFiles();
  if (files.length === 0) respond({});

  const parts = [];

  const lintable = new Set(
    files.filter(
      (f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f) && existsSync(path.join(root, f))
    )
  );
  if (lintable.size > 0 && existsSync(oxlintBin)) {
    // Type-aware mode needs the whole project graph — an explicit file list
    // breaks tsconfig resolution and floods output with bogus "error typed
    // value" findings. Run repo-wide (oxlint alone is sub-10s here even
    // cold), then keep only the lines that touch files this turn changed.
    const lint = spawnSync(oxlintBin, ["-c", "oxlint.config.ts", "."], {
      cwd: root,
      encoding: "utf8",
    });
    const relevant = (lint.stdout ?? "")
      .split("\n")
      .filter((line) => lintable.has(line.split(":")[0] ?? ""));
    if (lint.status !== 0 && relevant.length > 0) {
      parts.push(
        "Lint failed on changed files. Run `pnpm check` (or `pnpm fix` to autofix), then stop.",
        "",
        "```",
        clip(relevant.join("\n")),
        "```"
      );
    }
  }

  const webUiChanged = files.some(
    (f) =>
      f.startsWith("apps/web/src/shared/ui/") ||
      f.startsWith("apps/web/src/domains/") ||
      f.startsWith("apps/web/src/routes/") ||
      f.startsWith("apps/web/src/styles.css") ||
      f.startsWith("apps/web/scripts/") ||
      f.includes("UX.md") ||
      f.includes("AGENTS.md")
  );
  const dsBanScript = path.join(root, "apps/web/scripts/ds-ban-check.mjs");
  if (webUiChanged && existsSync(dsBanScript)) {
    const ban = spawnSync(process.execPath, [dsBanScript], {
      cwd: path.join(root, "apps/web"),
      encoding: "utf8",
    });
    if (ban.status !== 0) {
      parts.push(
        "`pnpm --filter @watchdog/web ds:check` failed after web UI edits. Read `apps/web/docs/UX.md` / `DOMAINS.md`, fix the violation, then stop.",
        "",
        "```",
        clip(formatSpawn(ban)),
        "```"
      );
    }
  }

  const agentsMdChanged = files.some((f) => f.endsWith("AGENTS.md"));
  if (agentsMdChanged) {
    const res = spawnSync(
      process.execPath,
      [path.join(root, "scripts/check-agents.mjs"), "--strict"],
      { cwd: root, encoding: "utf8" }
    );
    if (res.status !== 0) {
      parts.push(
        "`pnpm check:agents:strict` failed after an AGENTS.md edit. Fix the finding, then stop.",
        "",
        "```",
        clip(formatSpawn(res)),
        "```"
      );
    }
  }

  const skillsChanged = files.some(
    (f) =>
      f.includes("/.agents/skills/") ||
      f.startsWith(".agents/skills/") ||
      f === ".cursor/README.md"
  );
  if (skillsChanged) {
    const res = spawnSync(
      process.execPath,
      [path.join(root, "scripts/validate-agents.mjs")],
      { cwd: root, encoding: "utf8" }
    );
    if (res.status !== 0) {
      parts.push(
        "`pnpm validate:agents` failed after a skill or `.cursor/README.md` edit. Fix the finding, then stop.",
        "",
        "```",
        clip(formatSpawn(res)),
        "```"
      );
    }
  }

  if (parts.length === 0) respond({});
  respond({ followup_message: parts.join("\n") });
}

main();
