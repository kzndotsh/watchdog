import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { createLogger } from "@watchdog/log";

import { initWatchdogLogger } from "../init.ts";

function drainBody(drainDir: string): string {
  return readdirSync(drainDir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => readFileSync(path.join(drainDir, name), "utf-8"))
    .join("\n");
}

function waitForDrain(
  drainDir: string,
  predicate: (body: string) => boolean,
  timeoutMs = 3000
): Promise<string> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const body = drainBody(drainDir);
      if (predicate(body)) {
        resolve(body);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        reject(
          new Error(`drain did not satisfy predicate within ${timeoutMs}ms`)
        );
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}

describe("initWatchdogLogger", () => {
  const drainDir = mkdtempSync(path.join(tmpdir(), "wd-log-"));

  beforeAll(() => {
    initWatchdogLogger({
      service: "test-log",
      drainDir,
      pretty: false,
    });
  });

  it("redacts password-like fields from drained output", async () => {
    const log = createLogger({ scope: "auth-redact" });
    log.info("auth", {
      password: "super-secret-password",
      authorization: "Bearer super-secret-token",
    });
    log.emit();

    const body = await waitForDrain(
      drainDir,
      (b) => b.includes("auth-redact") && b.includes("[REDACTED]")
    );
    expect(body).not.toMatch(/super-secret-password/);
    expect(body).not.toMatch(/super-secret-token/);
  });

  it("keeps digit-heavy case UUIDs verbatim (builtins off)", async () => {
    const caseId = "00000000-0000-4000-8000-000000000001";
    const log = createLogger({ scope: "case-uuid" });
    log.info("case", {
      case: { caseId },
    });
    log.emit();

    const body = await waitForDrain(drainDir, (b) => b.includes(caseId));
    expect(body).toContain(caseId);
    expect(body).not.toMatch(/\*{4}/);
  });

  it("writes compact NDJSON (each non-empty line JSON.parses)", async () => {
    const log = createLogger({ scope: "ndjson-check" });
    log.info("ndjson-check", { ok: true });
    log.emit();

    const body = await waitForDrain(drainDir, (b) =>
      b.includes("ndjson-check")
    );
    const lines = body.split("\n").filter((line) => line.trim().length > 0);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
