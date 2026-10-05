/**
 * Proves the real `oxlint.config.ts` only lets tests and test-helper trees import the
 * unvalidated brand stampers `untrustedCaseId` / `untrustedOrganizationId` from
 * `@watchdog/test-kit` (ADR-0003). Probe files are written under covered paths and
 * removed after.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const coreSrc = path.join(repoRoot, "packages/core/src");
const testKitSrc = path.join(repoRoot, "packages/test-kit/src");
const capsTesting = path.join(repoRoot, "packages/caps/src/testing");

const IMPORT =
  'import { untrustedCaseId } from "@watchdog/test-kit";\n\nexport const a = untrustedCaseId("x");\n';
const IMPORT_FIXTURES =
  'import { untrustedOrganizationId as o } from "@watchdog/test-kit/fixtures";\n\nexport const a = o("x");\n';
const REEXPORT =
  'export { untrustedOrganizationId } from "@watchdog/test-kit";\n';
const SAFE =
  'import { testCaseId } from "@watchdog/test-kit";\n\nexport const a = testCaseId(1);\n';

let probeDir = "";
let testsDir = "";
let kitDir = "";
let capsDir = "";
let output = "";

beforeAll(() => {
  probeDir = mkdtempSync(path.join(coreSrc, "__oxlint-probe-"));
  testsDir = path.join(probeDir, "__tests__");
  mkdirSync(testsDir);
  kitDir = mkdtempSync(path.join(testKitSrc, "__oxlint-probe-"));
  mkdirSync(capsTesting, { recursive: true });
  capsDir = mkdtempSync(path.join(capsTesting, "__oxlint-probe-"));
  writeFileSync(path.join(probeDir, "prod-import.ts"), IMPORT);
  writeFileSync(path.join(probeDir, "prod-aliased.ts"), IMPORT_FIXTURES);
  writeFileSync(path.join(probeDir, "prod-reexport.ts"), REEXPORT);
  writeFileSync(path.join(probeDir, "prod-safe.ts"), SAFE);
  writeFileSync(path.join(probeDir, "in-test.test.ts"), IMPORT);
  writeFileSync(path.join(testsDir, "in-tests-dir.ts"), IMPORT);
  writeFileSync(path.join(kitDir, "kit.ts"), IMPORT);
  writeFileSync(path.join(capsDir, "helper.ts"), IMPORT);
  const res = spawnSync(
    path.join(repoRoot, "node_modules/.bin/oxlint"),
    [
      "-c",
      "oxlint.config.ts",
      ...[probeDir, kitDir, capsDir].map((d) => path.relative(repoRoot, d)),
    ],
    { cwd: repoRoot, encoding: "utf-8" }
  );
  output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
});

afterAll(() => {
  for (const dir of [probeDir, kitDir, capsDir]) {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

const hitsFor = (dir: string, file: string) =>
  output
    .split("\n")
    .filter((line) => line.includes(`${path.basename(dir)}/${file}:`))
    .filter((line) => line.includes("no-untrusted-id-import"));

describe("untrusted id helper import ban (oxlint.config.ts)", () => {
  it.each(["prod-import.ts", "prod-aliased.ts", "prod-reexport.ts"])(
    "rejects %s in a production file",
    (file) => {
      expect(hitsFor(probeDir, file)).not.toHaveLength(0);
    }
  );
  it("allows other test-kit imports in production files", () => {
    expect(hitsFor(probeDir, "prod-safe.ts")).toHaveLength(0);
  });
  it("allows *.test.ts", () => {
    expect(hitsFor(probeDir, "in-test.test.ts")).toHaveLength(0);
  });
  it("allows __tests__ directories", () => {
    expect(hitsFor(probeDir, "__tests__/in-tests-dir.ts")).toHaveLength(0);
  });
  it("allows packages/test-kit/src and caps testing helpers", () => {
    expect(hitsFor(kitDir, "kit.ts")).toHaveLength(0);
    expect(hitsFor(capsDir, "helper.ts")).toHaveLength(0);
  });
});
