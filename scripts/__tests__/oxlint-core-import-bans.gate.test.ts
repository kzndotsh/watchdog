/**
 * Proves the real `oxlint.config.ts` keeps infrastructure clients out of `packages/core/src`
 * (static, aliased, namespace and dynamic imports), so each is built in one place and read
 * from a service:
 *
 * - the global `db` client from `@watchdog/db` (use the `Db` service); type and repo imports
 *   stay allowed;
 * - `S3Client` and `S3` from `@aws-sdk/client-s3`, outside `infra/blob-store.ts` (use the
 *   `BlobStore` service); command and type imports stay allowed.
 *
 * Probe files are written into one throwaway repo that carries the real config and plugin
 * (helpers/oxlint-fixture.ts), linted once for both bans.
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const DB_PROBE = "packages/core/src/probe-db";
const S3_PROBE = "packages/core/src/probe-s3";
const BLOB_STORE = "packages/core/src/infra/blob-store.ts";

type Ban = {
  readonly title: string;
  readonly probe: string;
  readonly dynamicRule: string;
  readonly fix: string;
  readonly fail: Readonly<Record<string, string>>;
  readonly pass: Readonly<Record<string, string>>;
};

const BANS: readonly Ban[] = [
  {
    title: "core global-db import ban (oxlint.config.ts)",
    probe: DB_PROBE,
    dynamicRule: "watchdog/no-core-db-dynamic-import",
    fix: "Db service",
    fail: {
      named: 'import { db } from "@watchdog/db";\nexport const a = db;\n',
      aliased: 'import { db as x } from "@watchdog/db";\nexport const a = x;\n',
      namespace: 'import * as m from "@watchdog/db";\nexport const a = m;\n',
      dynamic: 'export const a = async () => await import("@watchdog/db");\n',
      "dynamic-bare": 'export const a = () => import("@watchdog/db");\n',
    },
    pass: {
      "type-import":
        'import type { DbExec } from "@watchdog/db";\nexport type A = DbExec;\n',
      "repo-import":
        'import { casesRepo } from "@watchdog/db";\n\nexport const a = casesRepo;\n',
      "other-dynamic": 'export const a = () => import("@watchdog/log");\n',
    },
  },
  {
    title: "core S3Client import ban (oxlint.config.ts)",
    probe: S3_PROBE,
    dynamicRule: "watchdog/no-core-s3-dynamic-import",
    fix: "BlobStore service",
    fail: {
      named:
        'import { S3Client } from "@aws-sdk/client-s3";\nexport const a = new S3Client({});\n',
      aliased:
        'import { S3Client as C } from "@aws-sdk/client-s3";\nexport const a = new C({});\n',
      "named-s3":
        'import { S3 } from "@aws-sdk/client-s3";\nexport const a = new S3({});\n',
      namespace:
        'import * as s3 from "@aws-sdk/client-s3";\nexport const a = new s3.S3Client({});\n',
      dynamic:
        'export const a = async () => await import("@aws-sdk/client-s3");\n',
      "dynamic-bare": 'export const a = () => import("@aws-sdk/client-s3");\n',
    },
    pass: {
      "command-import":
        'import { GetObjectCommand } from "@aws-sdk/client-s3";\n\nexport const a = GetObjectCommand;\n',
      "type-import":
        'import type { S3Client } from "@aws-sdk/client-s3";\nexport type A = S3Client;\n',
      "other-dynamic": 'export const a = () => import("@watchdog/log");\n',
      "other-package":
        'import { Effect } from "effect";\n\nexport const a = Effect;\n',
    },
  },
];

const RESTRICTED =
  /^(eslint\/no-restricted-imports|watchdog\/no-core-(db|s3)-dynamic-import)$/;

const createFixture = oxlintFixtureFactory();

let result: LintResult;

beforeAll(() => {
  const fixture = createFixture();
  for (const ban of BANS) {
    for (const [name, src] of Object.entries({ ...ban.fail, ...ban.pass })) {
      fixture.write(`${ban.probe}/${name}.ts`, src);
    }
  }
  // The one place allowed to build the S3 client: same violating source, exempt path.
  fixture.write(BLOB_STORE, BANS[1]?.fail.named ?? "");
  result = fixture.lint([DB_PROBE, S3_PROBE, BLOB_STORE]);
}, LINT_TIMEOUT_MS);

const restrictedFor = (file: string) =>
  findingsFor(result, file).filter((f) => RESTRICTED.test(f.rule));

describe.each(BANS)("$title", (ban) => {
  it.each(Object.keys(ban.fail))("rejects %s", (name) => {
    expect(restrictedFor(`${ban.probe}/${name}.ts`)).not.toHaveLength(0);
  });

  it.each(Object.keys(ban.pass))("allows %s", (name) => {
    expect(restrictedFor(`${ban.probe}/${name}.ts`)).toHaveLength(0);
  });

  it("reports the dynamic import with its fix and location", () => {
    const [hit] = findingsFor(
      result,
      `${ban.probe}/dynamic.ts`,
      ban.dynamicRule
    );
    expect(hit?.message).toContain(ban.fix);
    expect(hit?.line).toBe(1);
  });
});

describe("core S3Client import ban exemption", () => {
  it("exempts infra/blob-store.ts, the one place that builds the client", () => {
    expect(restrictedFor(BLOB_STORE)).toHaveLength(0);
  });
});
