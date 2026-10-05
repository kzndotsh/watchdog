/**
 * Proves the real `oxlint.config.ts` bans importing `S3Client` and `S3` from
 * `@aws-sdk/client-s3` in `packages/core/src` (static, aliased, namespace and
 * dynamic) outside `infra/blob-store.ts`, so the client is built only there and
 * read from the `BlobStore` service. Command and type imports stay allowed.
 * Probe files are written under the covered path (the config's `files` globs are
 * repo-relative) and removed after.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const coreSrc = path.join(repoRoot, "packages/core/src");

const FAIL_CASES = {
  named:
    'import { S3Client } from "@aws-sdk/client-s3";\nexport const a = new S3Client({});\n',
  aliased:
    'import { S3Client as C } from "@aws-sdk/client-s3";\nexport const a = new C({});\n',
  "named-s3":
    'import { S3 } from "@aws-sdk/client-s3";\nexport const a = new S3({});\n',
  namespace:
    'import * as s3 from "@aws-sdk/client-s3";\nexport const a = new s3.S3Client({});\n',
  dynamic: 'export const a = async () => await import("@aws-sdk/client-s3");\n',
  "dynamic-bare": 'export const a = () => import("@aws-sdk/client-s3");\n',
} as const;

const PASS_CASES = {
  "command-import":
    'import { GetObjectCommand } from "@aws-sdk/client-s3";\n\nexport const a = GetObjectCommand;\n',
  "type-import":
    'import type { S3Client } from "@aws-sdk/client-s3";\nexport type A = S3Client;\n',
  "other-dynamic": 'export const a = () => import("@watchdog/log");\n',
  "other-package":
    'import { Effect } from "effect";\n\nexport const a = Effect;\n',
} as const;

let probeDir = "";
let output = "";

beforeAll(() => {
  probeDir = mkdtempSync(path.join(coreSrc, "__oxlint-s3-probe-"));
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

const RESTRICTED = /no-restricted-imports|no-core-s3-dynamic-import/;

const restrictedFor = (name: string) =>
  output
    .split("\n")
    .filter((line) => line.includes(`${path.basename(probeDir)}/${name}.ts:`))
    .filter((line) => RESTRICTED.test(line));

describe("core S3Client import ban (oxlint.config.ts)", () => {
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
  it("exempts infra/blob-store.ts, the one place that builds the client", () => {
    const res = spawnSync(
      path.join(repoRoot, "node_modules/.bin/oxlint"),
      ["-c", "oxlint.config.ts", "packages/core/src/infra/blob-store.ts"],
      { cwd: repoRoot, encoding: "utf-8" }
    );
    const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
    expect(out.split("\n").filter((l) => RESTRICTED.test(l))).toHaveLength(0);
  });
});
