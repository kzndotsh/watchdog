/**
 * Proves the real `oxlint.config.ts` bans hand-written copies of derived Cap metadata in
 * `packages/caps/src` (`watchdog/no-derived-cap-metadata`): a hard-coded Watchdog User-Agent,
 * a `reportLabel` equal to the Cap id, and `needs_key` / `third_party` in `flags`. Probe
 * files are written into a throwaway repo that carries the real config and plugin
 * (helpers/oxlint-fixture.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const RULE = "watchdog/no-derived-cap-metadata";
const DIR = "packages/caps/src/threat/demo.lookup";

const createFixture = oxlintFixtureFactory();

let result: LintResult;

const FAIL = {
  "ua-const.ts":
    'export const UA = "Watchdog/1.0 (+threat.demo.lookup; OSINT)";\n',
  "ua-inline.ts": 'export const opts = { userAgent: "Watchdog/2.3 (+x)" };\n',
  "label-equals-id.ts":
    'export const cap = { id: "threat.demo.lookup", reportLabel: "threat.demo.lookup" };\n',
  "needs-key.ts":
    'export const cap = { id: "a.b", flags: ["needs_key", "slow"] };\n',
  "third-party.ts":
    'export const cap = { id: "a.b", flags: ["third_party"] };\n',
} as const;

const OK = {
  "derived.ts":
    'import { watchdogUserAgent } from "@watchdog/tools/errors";\nexport const ua = watchdogUserAgent("a.b");\n',
  "label-override.ts":
    'export const cap = { id: "threat.demo.lookup", reportLabel: "demo report" };\n',
  "authored-flags.ts":
    'export const cap = { id: "a.b", flags: ["slow", "invasive"] };\n',
  "other-string.ts": 'export const s = "Watchdogs of the web";\n',
  "needs-key-elsewhere.ts":
    'export const cap = { id: "a.b", labels: ["needs_key"] };\n',
} as const;

beforeAll(() => {
  const fixture = createFixture();
  for (const [name, source] of Object.entries({ ...FAIL, ...OK })) {
    fixture.write(`${DIR}/${name}`, source);
  }
  fixture.write(`${DIR}/__tests__/ua.test.ts`, FAIL["ua-const.ts"]);
  fixture.write(`${DIR}/ua.test.ts`, FAIL["ua-const.ts"]);
  fixture.write("packages/tools/src/ua.ts", FAIL["ua-const.ts"]);
  result = fixture.lint(["packages"]);
}, LINT_TIMEOUT_MS);

const hits = (file: string) => findingsFor(result, file, RULE);

describe("derived Cap metadata (no-derived-cap-metadata)", () => {
  it.each(Object.keys(FAIL))("rejects %s", (name) => {
    expect(hits(`${DIR}/${name}`)).toHaveLength(1);
  });

  it("names the fix on the right line", () => {
    const [ua] = hits(`${DIR}/ua-const.ts`);
    expect(ua?.message).toContain("watchdogUserAgent");
    expect(ua?.line).toBe(1);
    const [flag] = hits(`${DIR}/needs-key.ts`);
    expect(flag?.message).toContain("credentials");
    const [label] = hits(`${DIR}/label-equals-id.ts`);
    expect(label?.message).toContain("defaults to the id");
  });

  it.each(Object.keys(OK))("allows %s", (name) => {
    expect(hits(`${DIR}/${name}`)).toHaveLength(0);
  });

  it("exempts tests and packages outside caps", () => {
    expect(hits(`${DIR}/__tests__/ua.test.ts`)).toHaveLength(0);
    expect(hits(`${DIR}/ua.test.ts`)).toHaveLength(0);
    expect(hits("packages/tools/src/ua.ts")).toHaveLength(0);
  });
});
