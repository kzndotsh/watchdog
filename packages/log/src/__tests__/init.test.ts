import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { createLogger } from "@watchdog/log";

import { initWatchdogLogger, resolveDrainDir } from "../init.ts";

describe("resolveDrainDir", () => {
  it("keeps the app's directory when WD_LOG_DIR is unset or blank", () => {
    expect(resolveDrainDir("/app/.evlog/logs", undefined)).toBe(
      "/app/.evlog/logs"
    );
    expect(resolveDrainDir("/app/.evlog/logs", "  ")).toBe("/app/.evlog/logs");
  });

  it("uses WD_LOG_DIR when set", () => {
    expect(resolveDrainDir("/app/.evlog/logs", " /tmp/evlog ")).toBe(
      "/tmp/evlog"
    );
  });
});

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

  const sent: string[] = [];
  let sinkBehavior: "ok" | "reject" | "hang" = "ok";

  beforeAll(() => {
    // The sink captures the global fetch when the logger is set up; the process handlers it
    // installs must not outlive this test (they would exit the vitest worker).
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      sent.push(typeof init?.body === "string" ? init.body : "");
      if (sinkBehavior === "reject") throw new Error("network down");
      if (sinkBehavior === "hang") return new Promise<Response>(() => {});
      return new Response(null, { status: 200 });
    });
    const on = vi.spyOn(process, "on").mockImplementation(() => process);
    initWatchdogLogger({
      service: "test-log",
      drainDir,
      pretty: false,
      errorReporting: {
        dsn: "https://pub@errors.example.test/1",
        release: "9.9.9",
        environment: "test",
        secrets: ["vault-master-key-0123456789"],
      },
    });
    on.mockRestore();
    vi.unstubAllGlobals();
  });

  it("reports an error event, scrubbed, with the release", async () => {
    const log = createLogger({ scope: "report-error" });
    log.set({ path: "/api/v1/cases", operation: "cases.create" });
    log.error(new Error("boom Bearer tok-abc123 vault-master-key-0123456789"));
    log.emit();

    await vi.waitFor(() => {
      expect(sent.some((body) => body.includes("boom"))).toBe(true);
    });
    const body = sent.find((entry) => entry.includes("boom")) ?? "";
    expect(body).toContain("9.9.9");
    expect(body).toContain("/api/v1/cases");
    expect(body).not.toContain("tok-abc123");
    expect(body).not.toContain("vault-master-key-0123456789");
  });

  it("does not report info events", async () => {
    const before = sent.length;
    const log = createLogger({ scope: "report-info" });
    log.info("fine", { ok: true });
    log.emit();
    await waitForDrain(drainDir, (b) => b.includes("report-info"));
    expect(sent).toHaveLength(before);
  });

  it("a rejecting or hanging sink never stops the log from being written", async () => {
    for (const behavior of ["reject", "hang"] as const) {
      sinkBehavior = behavior;
      const scope = `sink-${behavior}`;
      const log = createLogger({ scope });
      log.error(new Error(`failure ${scope}`));
      expect(() => log.emit()).not.toThrow();
      // eslint-disable-next-line no-await-in-loop -- one case at a time: they share sinkBehavior
      await waitForDrain(drainDir, (b) => b.includes(`failure ${scope}`));
    }
    sinkBehavior = "ok";
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
