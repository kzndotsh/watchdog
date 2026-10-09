/**
 * Proves the real `oxlint.config.ts` bans importing `S3Client` and `S3` from
 * `@aws-sdk/client-s3` in `packages/core/src` (static, aliased, namespace and
 * dynamic) outside `infra/blob-store.ts`, so the client is built only there and
 * read from the `BlobStore` service. Command and type imports stay allowed.
 * Probe files are written into a throwaway repo that carries the real config and
 * plugin (helpers/oxlint-fixture.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const PROBE = "packages/core/src/probe";
const BLOB_STORE = "packages/core/src/infra/blob-store.ts";

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

const RESTRICTED =
  /^(eslint\/no-restricted-imports|watchdog\/no-core-s3-dynamic-import)$/;

const createFixture = oxlintFixtureFactory();

let result: LintResult;

beforeAll(() => {
  const fixture = createFixture();
  for (const [name, src] of Object.entries({ ...FAIL_CASES, ...PASS_CASES })) {
    fixture.write(`${PROBE}/${name}.ts`, src);
  }
  // The one place allowed to build the client: same violating source, exempt path.
  fixture.write(BLOB_STORE, FAIL_CASES.named);
  result = fixture.lint([PROBE, BLOB_STORE]);
}, LINT_TIMEOUT_MS);

const restrictedFor = (file: string) =>
  findingsFor(result, file).filter((f) => RESTRICTED.test(f.rule));

describe("core S3Client import ban (oxlint.config.ts)", () => {
  for (const name of Object.keys(FAIL_CASES)) {
    it(`rejects ${name}`, () => {
      expect(restrictedFor(`${PROBE}/${name}.ts`)).not.toHaveLength(0);
    });
  }
  for (const name of Object.keys(PASS_CASES)) {
    it(`allows ${name}`, () => {
      expect(restrictedFor(`${PROBE}/${name}.ts`)).toHaveLength(0);
    });
  }
  it("exempts infra/blob-store.ts, the one place that builds the client", () => {
    expect(restrictedFor(BLOB_STORE)).toHaveLength(0);
  });
  it("reports the dynamic import with its fix and location", () => {
    const [hit] = findingsFor(
      result,
      `${PROBE}/dynamic.ts`,
      "watchdog/no-core-s3-dynamic-import"
    );
    expect(hit?.message).toContain("BlobStore service");
    expect(hit?.line).toBe(1);
  });
});
