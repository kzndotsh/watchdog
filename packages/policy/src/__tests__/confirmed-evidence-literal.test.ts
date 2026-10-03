import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CONFIRMED_REQUIRES_EVIDENCE } from "../confirmed-evidence.ts";

/**
 * Guard: the "confirmed requires Evidence" message text lives only in
 * `packages/policy/src/confirmed-evidence.ts`. Anything else must import
 * `CONFIRMED_REQUIRES_EVIDENCE` from `@watchdog/policy`.
 */
const FORBIDDEN = [
  CONFIRMED_REQUIRES_EVIDENCE,
  "confirmed requires at least",
  "confirmed requires evidence",
] as const;

const SOURCE_FILE = /\.(?:ts|tsx)$/;
const IGNORED =
  /(?:^|\/)(?:__tests__|generated|node_modules|_legacy-v2)\/|\.(?:test|spec|gen)\.tsx?$|(?:^|\/)e2e\//;
const OWN_MODULE = "packages/policy/src/confirmed-evidence.ts";

function findForbiddenLiteral(text: string): string | undefined {
  return FORBIDDEN.find((literal) => text.includes(literal));
}

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

function trackedSourceFiles(): string[] {
  return execFileSync("git", ["ls-files", "apps", "packages"], {
    cwd: repoRoot,
    encoding: "utf-8",
  })
    .split("\n")
    .filter(
      (file) =>
        SOURCE_FILE.test(file) && !IGNORED.test(file) && file !== OWN_MODULE
    );
}

describe("confirmed-requires-evidence message literal", () => {
  it("scanner flags the message and the old literals (must-fail fixture)", () => {
    expect(
      findForbiddenLiteral(`reason: "${CONFIRMED_REQUIRES_EVIDENCE}"`)
    ).toBe(CONFIRMED_REQUIRES_EVIDENCE);
    expect(findForbiddenLiteral("confirmed requires at least 1 item")).toBe(
      "confirmed requires at least"
    );
    expect(findForbiddenLiteral("confirmed requires evidence")).toBe(
      "confirmed requires evidence"
    );
    expect(findForbiddenLiteral("import { CONFIRMED_REQUIRES_EVIDENCE }")).toBe(
      undefined
    );
  });

  it("appears in no tracked source file outside @watchdog/policy and tests", () => {
    const files = trackedSourceFiles();
    expect(files.length).toBeGreaterThan(100);
    const offenders = files.filter(
      (file) =>
        findForbiddenLiteral(
          readFileSync(path.join(repoRoot, file), "utf-8")
        ) !== undefined
    );
    expect(offenders).toEqual([]);
  });
});
