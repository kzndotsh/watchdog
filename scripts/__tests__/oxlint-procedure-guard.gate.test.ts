/**
 * Proves the real `oxlint.config.ts` enforces `watchdog/procedure-must-be-guarded` in
 * `packages/api/src/procedures`: procedures build from `authed` (or `graphChildWrite`);
 * the public builder `pub` (however imported, aliased, re-exported or wrapped) needs an
 * adjacent `// public: <reason>` comment. Probe files are written into a throwaway repo
 * that carries the real config and plugin (helpers/oxlint-fixture.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import { findingsFor, oxlintFixtureFactory } from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const DIR = "packages/api/src/procedures";
const RULE = "watchdog/procedure-must-be-guarded";

const OS_PUB = 'import { pub } from "../os";\n\n';
const USE = "export const a = pub.handler(() => 1);\n";

const FAIL_CASES = {
  "pub-bare": `${OS_PUB}${USE}`,
  "pub-aliased":
    'import { pub as open } from "../os";\n\nexport const a = open.handler(() => 1);\n',
  "pub-namespace":
    'import * as os from "../os";\n\nexport const a = os.pub.handler(() => 1);\n',
  "pub-reexport": 'export { pub } from "../os";\n',
  "pub-reexport-renamed": 'export { pub as open } from "../os";\n',
  "pub-reexport-star": 'export * from "../os";\n',
  "pub-alias-const": `${OS_PUB}const open = pub;\nexport const a = open.handler(() => 1);\n`,
  "pub-helper": `${OS_PUB}const make = () => pub.route({ method: "GET" });\nexport const a = make().handler(() => 1);\n`,
  "pub-comment-not-adjacent": `${OS_PUB}// public: probe reachable by uptime monitors\n\n${USE}`,
  "pub-comment-empty-reason": `${OS_PUB}// public:\n${USE}`,
  "pub-comment-wrong-word": `${OS_PUB}// TODO: guard this\n${USE}`,
  "orpc-os-direct":
    'import { os } from "@orpc/server";\n\nexport const a = os.handler(() => 1);\n',
  "orpc-os-aliased":
    'import { os as builder } from "@orpc/server";\n\nexport const a = builder.handler(() => 1);\n',
} as const;

const PASS_CASES = {
  authed:
    'import { authed } from "../os";\n\nexport const a = authed.handler(() => 1);\n',
  "graph-child-write":
    'import { graphChildWrite } from "../os";\n\nexport const a = graphChildWrite.handler(() => 1);\n',
  "authed-aliased":
    'import { authed as guarded } from "../os";\n\nexport const a = guarded.handler(() => 1);\n',
  "pub-line-comment": `${OS_PUB}// public: uptime probes call it without a session\n${USE}`,
  "pub-block-comment": `${OS_PUB}/** public: uptime probes call it without a session */\n${USE}`,
  "pub-multiline-comment": `${OS_PUB}// public: uptime probes call it without a session,\n// so it cannot require an actor.\n${USE}`,
  "pub-same-line-comment": `${OS_PUB}export const a = pub.handler(() => 1); // public: uptime probes\n`,
  "pub-alias-justified": `${OS_PUB}// public: health-style probes share one builder\nconst open = pub;\nexport const a = open.handler(() => 1);\n`,
  "pub-reexport-justified":
    '// public: the probe module re-exports the public builder\nexport { pub } from "../os";\n',
  "helper-file":
    'import { resolveAuthMethod } from "../os";\n\nexport const kind = resolveAuthMethod;\n',
  "plain-file": "export const LIMIT = 50;\n",
  "pub-named-property":
    "export const a = { pub: 1 };\nexport const b = a.pub;\n",
  "orpc-type-import":
    'import type { os } from "@orpc/server";\n\nexport type A = typeof os;\n',
  "orpc-other-import":
    'import { ORPCError } from "@orpc/server";\n\nexport const a = ORPCError;\n',
} as const;

const createFixture = oxlintFixtureFactory();

let result: LintResult;

beforeAll(() => {
  const fixture = createFixture();
  for (const [name, src] of Object.entries({ ...FAIL_CASES, ...PASS_CASES })) {
    fixture.write(`${DIR}/${name}.ts`, src);
  }
  // The same violating source outside the procedures folder and inside its tests.
  fixture.write("packages/api/src/other.ts", FAIL_CASES["pub-bare"]);
  fixture.write(`${DIR}/__tests__/probe.test.ts`, FAIL_CASES["pub-bare"]);
  result = fixture.lint([DIR, "packages/api/src/other.ts"]);
});

const hits = (file: string) => findingsFor(result, file, RULE);

describe("procedure-must-be-guarded (oxlint.config.ts)", () => {
  for (const name of Object.keys(FAIL_CASES)) {
    it(`rejects ${name}`, () => {
      expect(hits(`${DIR}/${name}.ts`)).not.toHaveLength(0);
    });
  }
  for (const name of Object.keys(PASS_CASES)) {
    it(`allows ${name}`, () => {
      expect(hits(`${DIR}/${name}.ts`)).toHaveLength(0);
    });
  }
  it("does not apply outside the procedures folder", () => {
    expect(hits("packages/api/src/other.ts")).toHaveLength(0);
  });
  it("does not apply to the folder's tests", () => {
    expect(hits(`${DIR}/__tests__/probe.test.ts`)).toHaveLength(0);
  });
  it("reports the fix and the conventions entry at the use site", () => {
    const [hit] = hits(`${DIR}/pub-bare.ts`);
    expect(hit?.message).toContain("authed");
    expect(hit?.message).toContain("// public:");
    expect(hit?.message).toContain("conventions");
    expect(hit?.line).toBe(3);
  });
  it("reports a raw os builder at its import", () => {
    const [hit] = hits(`${DIR}/orpc-os-direct.ts`);
    expect(hit?.message).toContain("authed");
    expect(hit?.line).toBe(1);
  });
});
