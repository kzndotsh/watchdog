import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  chmod: vi.fn(() => Promise.reject(new Error("EPERM"))),
}));

import { createPrivateLogDir } from "../private-files.ts";

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "wd-log-chmod-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("a file that cannot be restricted", () => {
  it("is reported once, not on every scan", async () => {
    let now = 1_000_000;
    const dir = path.join(root, "logs");
    const { restrictNewFiles } = createPrivateLogDir(dir, () => now);
    writeFileSync(path.join(dir, "2026-01-01.jsonl"), "{}\n");

    const first = await restrictNewFiles();
    now += 6000;
    const second = await restrictNewFiles();

    expect(first).toContain("0600");
    expect(second).toBeNull();
  });
});
