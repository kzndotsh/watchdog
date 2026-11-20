#!/usr/bin/env node
/**
 * stop hook: runs `pnpm verify` (scripts/verify.mjs, the changed-only form:
 * lint and format on changed files, the static gates, typecheck, and the tests
 * of the affected packages) when the working tree is dirty, and hands its
 * failures back to the agent. CI runs `pnpm verify --full`.
 *
 * One gate, two harnesses. A thin adapter layer normalizes each tool's stop
 * payload into one internal shape and renders the findings in the tool's own
 * response shape:
 *   - Cursor (`status`, `loop_count`)    -> `{ followup_message }`
 *   - Claude Code (`stop_hook_active`)   -> `{ decision: "block", reason }`
 * The harness is chosen by `--client=cursor|claude` (set in each tool's hook
 * config) and falls back to sniffing the payload.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { git } from "../../scripts/lib/git-range.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const verifyScript = path.join(root, "scripts/verify.mjs");

/** @param {Record<string, unknown>} obj */
function respond(obj) {
  process.stdout.write(JSON.stringify(obj));
  process.exit(0);
}

/** Cursor re-prompts at most this many times (`loop_limit` in hooks.json). */
const CURSOR_LOOP_LIMIT = 2;

/**
 * @param {Record<string, unknown>} input
 * @returns {"cursor" | "claude"}
 */
function detectClient(input) {
  const flag = process.argv.find((a) => a.startsWith("--client="));
  const named = flag?.slice("--client=".length);
  if (named === "cursor" || named === "claude") return named;
  return "stop_hook_active" in input || input.hook_event_name === "Stop"
    ? "claude"
    : "cursor";
}

/**
 * Input adapter: either tool's stop payload -> one internal shape. Read
 * defensively: unknown or missing fields mean "run the gate".
 * @param {Record<string, unknown>} input
 * @param {"cursor" | "claude"} client
 * @returns {{ allowStop: boolean }}
 */
function normalizeInput(input, client) {
  if (client === "claude") {
    // `stop_hook_active` means Claude Code is already continuing because of a
    // stop hook: allow the stop on that second pass (Cursor's loop limit is 2).
    return { allowStop: input.stop_hook_active === true };
  }
  const loops = typeof input.loop_count === "number" ? input.loop_count : 0;
  return {
    allowStop:
      input.status === "aborted" ||
      input.status === "error" ||
      loops >= CURSOR_LOOP_LIMIT,
  };
}

/**
 * Output adapter: findings text -> the tool's response object.
 * @param {"cursor" | "claude"} client
 * @param {string} message empty when the gate found nothing
 */
function render(client, message) {
  if (!message) return {};
  return client === "claude"
    ? { decision: "block", reason: message }
    : { followup_message: message };
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

/**
 * The tail: verify prints each failure as it finishes and its summary last.
 * @param {string} text
 */
function clip(text) {
  const t = text.trim();
  return t.length > 6000 ? `…\n${t.slice(-6000)}` : t || "(no output)";
}

/** @returns {boolean} throws when git fails (main()'s top-level catch fails open) */
function dirty() {
  return git(["status", "--porcelain"], root).trim() !== "";
}

function main() {
  const input = readInput();
  const client = detectClient(input);
  if (normalizeInput(input, client).allowStop) respond({});
  // A clean tree means the work is committed: nothing new to verify this turn.
  if (!dirty()) respond({});

  const res = spawnSync(process.execPath, [verifyScript], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status === 0) respond({});
  respond(
    render(
      client,
      [
        "`pnpm verify` failed. Fix the findings, rerun `pnpm verify`, then stop.",
        "",
        "```",
        clip(formatSpawn(res)),
        "```",
      ].join("\n")
    )
  );
}

/**
 * Fail-open is deliberate and documented (docs/contributing/ci-gates.md): a hook
 * must never block the agent because the hook itself broke (git unreadable, bad
 * input). Real gate failures are not swallowed here: each gate's non-zero exit is
 * reported through the client's block response inside main(). Only an internal error lands
 * in this catch, and it is announced on stderr instead of vanishing.
 */
try {
  main();
} catch (error) {
  process.stderr.write(
    `stop-gate: internal error, failing open: ${error instanceof Error ? error.message : String(error)}\n`
  );
  respond({});
}
