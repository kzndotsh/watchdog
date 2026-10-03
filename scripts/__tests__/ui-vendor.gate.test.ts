import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

// The version the script pins is recorded in the real lock; fixtures reuse it so the
// must-pass case follows a deliberate bump while still failing on any lock/script drift.
const realLock: { shadcn?: string } = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, "../../packages/ui/vendor.json"),
    "utf-8"
  )
);
const PINNED = realLock.shadcn ?? "";

function vendorRepo(lock: Record<string, unknown>) {
  const repo = createGateRepo(["ui-vendor.mjs"]);
  repo.write(
    "packages/ui/vendor.json",
    `${JSON.stringify({ style: "base-mira", components: [], files: {}, ...lock }, null, 2)}\n`
  );
  repo.commitAll("lock");
  return repo;
}

describe("ui-vendor check: shadcn CLI pin", () => {
  it("the repo lock records an exact version", () => {
    expect(PINNED).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("passes when the lock records the version the script uses", () => {
    const res = vendorRepo({ shadcn: PINNED }).run("ui-vendor.mjs", ["check"]);
    expect(res.code).toBe(0);
    expect(res.output).toContain("check:vendor: ok");
  });

  it("fails when the lock records a different version", () => {
    const res = vendorRepo({ shadcn: "0.0.1" }).run("ui-vendor.mjs", ["check"]);
    expect(res.code).toBe(1);
    expect(res.output).toContain("shadcn");
    expect(res.output).toContain("0.0.1");
    expect(res.output).toContain(PINNED);
  });

  it("fails when the lock records no version", () => {
    const res = vendorRepo({}).run("ui-vendor.mjs", ["check"]);
    expect(res.code).toBe(1);
    expect(res.output).toContain("shadcn");
  });
});
