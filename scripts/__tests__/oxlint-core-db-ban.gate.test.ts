/**
 * Proves the real `oxlint.config.ts` bans the global `db` client in
 * `packages/core/src` (static, aliased, namespace and dynamic imports) while
 * type imports and repo imports stay allowed. Probe files are written under the
 * covered path (the config's `files` globs are repo-relative) and removed after.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const coreSrc = path.join(repoRoot, "packages/core/src");

const FAIL_CASES = {
  named: 'import { db } from "@watchdog/db";\nexport const a = db;\n',
  aliased: 'import { db as x } from "@watchdog/db";\nexport const a = x;\n',
  namespace: 'import * as m from "@watchdog/db";\nexport const a = m;\n',
  dynamic: 'export const a = async () => await import("@watchdog/db");\n',
  "dynamic-bare": 'export const a = () => import("@watchdog/db");\n',
} as const;

const PASS_CASES = {
  "type-import":
    'import type { DbExec } from "@watchdog/db";\nexport type A = DbExec;\n',
  "repo-import":
    'import { casesRepo } from "@watchdog/db";\n\nexport const a = casesRepo;\n',
  "other-dynamic": 'export const a = () => import("@watchdog/log");\n',
} as const;

const RESTRICTED = /no-restricted-imports|no-core-db-dynamic-import/;

let probeDir = "";
let output = "";

beforeAll(() => {
  probeDir = mkdtempSync(path.join(coreSrc, "__oxlint-probe-"));
  for (const [name, src] of Object.entries({ ...FAIL_CASES, ...PASS_CASES })) {
    writeFileSync(path.join(probeDir, `${name}.ts`), src);
  }
  const res = spawnSync(
    path.join(repoRoot, "node_modules/.bin/oxlint"),
    ["-c", "oxlint.config.ts", path.relative(repoRoot, probeDir)],
    { cwd: repoRoot, encoding: "utf-8" }
  );
  output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
});

afterAll(() => {
  if (probeDir) rmSync(probeDir, { recursive: true, force: true });
});

const restrictedFor = (name: string) =>
  output
    .split("\n")
    .filter((line) => line.includes(`${path.basename(probeDir)}/${name}.ts:`))
    .filter((line) => RESTRICTED.test(line));

describe("core global-db import ban (oxlint.config.ts)", () => {
  for (const name of Object.keys(FAIL_CASES)) {
    it(`rejects ${name}`, () => {
      expect(restrictedFor(name)).not.toHaveLength(0);
    });
  }
  for (const name of Object.keys(PASS_CASES)) {
    it(`allows ${name}`, () => {
      expect(restrictedFor(name)).toHaveLength(0);
    });
  }
});
