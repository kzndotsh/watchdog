/**
 * Proves the real `oxlint.config.ts` bans importing `S3Client` in
 * `packages/core/src` (named, aliased, namespace-free command imports stay
 * allowed) so the client is built only in `infra/blob-store.ts` and read from
 * the `BlobStore` service. Probe files are written under the covered path (the
 * config's `files` globs are repo-relative) and removed after.
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
} as const;

const PASS_CASES = {
  "command-import":
    'import { GetObjectCommand } from "@aws-sdk/client-s3";\n\nexport const a = GetObjectCommand;\n',
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

const restrictedFor = (name: string) =>
  output
    .split("\n")
    .filter((line) => line.includes(`${path.basename(probeDir)}/${name}.ts:`))
    .filter((line) => line.includes("no-restricted-imports"));

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
});
