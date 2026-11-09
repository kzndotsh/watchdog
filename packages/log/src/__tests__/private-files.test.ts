import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLogger } from "@watchdog/log";

import { initWatchdogLogger } from "../init.ts";
import { createPrivateLogDir } from "../private-files.ts";

const mode = (p: string) =>
  Number.parseInt(statSync(p).mode.toString(8).slice(-3), 8);

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "wd-log-modes-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("createPrivateLogDir", () => {
  it("creates the directory 0700 and tightens an existing loose one", () => {
    const fresh = path.join(root, "a", "logs");
    createPrivateLogDir(fresh);
    expect(mode(fresh)).toBe(0o700);

    const loose = path.join(root, "loose");
    mkdirSync(loose);
    chmodSync(loose, 0o755);
    expect(mode(loose)).toBe(0o755);
    createPrivateLogDir(loose);
    expect(mode(loose)).toBe(0o700);
  });

  it("sets 0600 on files that exist, rescanning only after the interval", async () => {
    const dir = path.join(root, "logs");
    let now = 1_000_000;
    const { restrictNewFiles } = createPrivateLogDir(dir, () => now);
    const first = path.join(dir, "2026-01-01.jsonl");
    writeFileSync(first, "{}\n", { mode: 0o644 });
    await restrictNewFiles();
    expect(mode(first)).toBe(0o600);

    const second = path.join(dir, "2026-01-01.1.jsonl");
    writeFileSync(second, "{}\n", { mode: 0o644 });
    await restrictNewFiles();
    expect(mode(second)).toBe(0o644);
    now += 6000;
    await restrictNewFiles();
    expect(mode(second)).toBe(0o600);
  });
});

describe("restrictNewFiles scope", () => {
  it("never follows a symlink out of the directory and leaves subdirectories alone", async () => {
    const dir = path.join(root, "logs");
    const { restrictNewFiles } = createPrivateLogDir(dir);
    const outside = path.join(root, "outside.txt");
    writeFileSync(outside, "x", { mode: 0o644 });
    symlinkSync(outside, path.join(dir, "link.jsonl"));
    const sub = path.join(dir, "sub");
    mkdirSync(sub);
    chmodSync(sub, 0o755);
    const file = path.join(dir, "2026-01-01.jsonl");
    writeFileSync(file, "{}\n", { mode: 0o644 });

    await restrictNewFiles();

    expect(mode(file)).toBe(0o600);
    expect(mode(outside)).toBe(0o644);
    expect(mode(sub)).toBe(0o755);
  });
});

describe("createPrivateLogDir failure", () => {
  it("reports a directory it could not secure", () => {
    const blocker = path.join(root, "blocker");
    writeFileSync(blocker, "x");
    const { warning } = createPrivateLogDir(path.join(blocker, "logs"));
    expect(warning).toContain("0700");
  });

  it("reports no warning when it succeeds", () => {
    expect(createPrivateLogDir(path.join(root, "ok")).warning).toBeNull();
  });
});

describe("initWatchdogLogger drain permissions", () => {
  it("writes the NDJSON directory 0700 and its files 0600", async () => {
    const dir = path.join(root, ".evlog", "logs");
    initWatchdogLogger({ service: "wd-modes-test", drainDir: dir });
    const log = createLogger({ scope: "modes" });
    log.set({ message: "hello" });
    void log.emit();
    await expect
      .poll(() => {
        try {
          return readdirSync(dir).filter((n) => n.endsWith(".jsonl"));
        } catch {
          return [];
        }
      })
      .not.toEqual([]);
    const files = readdirSync(dir).filter((n) => n.endsWith(".jsonl"));
    await expect
      .poll(() => files.every((n) => mode(path.join(dir, n)) === 0o600))
      .toBe(true);
    expect(files.length).toBeGreaterThan(0);
    expect(mode(dir)).toBe(0o700);
    for (const name of files) expect(mode(path.join(dir, name))).toBe(0o600);
  });
});
