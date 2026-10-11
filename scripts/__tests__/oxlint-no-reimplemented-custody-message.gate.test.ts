/**
 * Proves the real `oxlint.config.ts` bans re-typing the custody evidence message
 * (`watchdog/no-reimplemented-custody-message`) outside `@watchdog/policy`: a string,
 * template, concatenation, `concat`, `join` or const that spells the text. Probe files are
 * written into a throwaway repo that carries the real config and plugin
 * (helpers/oxlint-fixture.ts). The fixture starts with no baseline.
 */
import { readdirSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  LINT_TIMEOUT_MS,
  findingsFor,
  oxlintFixtureFactory,
} from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const RULE = "watchdog/no-reimplemented-custody-message";
const DIR = "apps/web/src/domains/cases/lib";
const MSG = "confirmed requires at least one Evidence attachment";

const repoRoot = path.resolve(import.meta.dirname, "../..");

/** Every real app and package directory, so a new workspace is covered without an edit. */
const scopes = ["apps", "packages"].flatMap((group) =>
  readdirSync(path.join(repoRoot, group), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "node_modules")
    .map((entry) => `${group}/${entry.name}`)
);

const createFixture = oxlintFixtureFactory();

let result: LintResult;

/** Each source spells the message (or its distinctive phrase) itself. */
const FAIL = {
  "exact.ts": `export const m = "${MSG}";\n`,
  "single-quote.ts": `export const m = '${MSG}';\n`,
  "recased.ts": `export const m = "Confirmed Requires At Least one evidence";\n`,
  "prefix.ts": `export const m = "confirmed requires at least";\n`,
  "short-form.ts": `export const m = "confirmed requires evidence";\n`,
  "tail-phrase.ts": `export const m = "Needs at least one Evidence attachment";\n`,
  "embedded.ts": `export const m = "Cannot save: ${MSG}.";\n`,
  "whitespace.ts": `export const m = "confirmed requires\\n  at least one Evidence";\n`,
  "template.ts": `export const m = \`${MSG}\`;\n`,
  "template-expr.ts": `export const f = (n: number) => \`\${n}: ${MSG}\`;\n`,
  "template-const.ts": `const A = "at least";\nexport const m = \`confirmed requires \${A} one\`;\n`,
  "concat.ts": `export const m = "confirmed requires " + "at least one Evidence attachment";\n`,
  "concat-chain.ts": `export const m = "confirmed " + "requires " + "evidence";\n`,
  "concat-const.ts": `const A = "confirmed requires ";\nconst B = "at least one";\nexport const m = A + B;\n`,
  "concat-var.ts": `const lead = "confirmed requires ";\nexport const f = (x: string) => lead + "evidence" + x;\n`,
  "concat-template.ts": `export const m = "confirmed " + \`requires \${"evidence"}\`;\n`,
  "concat-method.ts": `export const m = "confirmed requires ".concat("at least one");\n`,
  "join.ts": `export const m = ["confirmed", "requires", "evidence"].join(" ");\n`,
  "join-const.ts": `const parts = ["confirmed requires", "evidence"];\nexport const m = parts.join(" ");\n`,
  "computed-key.ts": `export const o = { ["${MSG}"]: 1 };\n`,
  "object-value.ts": `export const o = { reason: "${MSG}" };\n`,
  "call-arg.ts": `export const f = () => new Error("${MSG}");\n`,
  "scoped.ts": `export function a() {\n  const t = "confirmed requires evidence";\n  return t;\n}\nexport function b() {\n  const t = "ok";\n  return t;\n}\n`,
  "shadow-last.ts": `const lead = "ok ";\nexport function f() {\n  const lead = "confirmed requires ";\n  return lead + "evidence";\n}\nexport const g = lead + "x";\n`,
  "string-raw.ts": `export const m = String.raw\`${MSG}\`;\n`,
  "as-cast.ts": `export const m = "${MSG}" as const;\n`,
  "let-unchanged.ts": `let lead = "confirmed requires ";\nexport const m = lead + "evidence";\n`,
  "var-unchanged.ts": `var lead = "confirmed requires ";\nexport const m = lead + "evidence";\n`,
  "jsx-text.tsx": `export const X = () => <p>${MSG}</p>;\n`,
  "jsx-text-multiline.tsx": `export const X = () => (\n  <p>\n    confirmed requires\n    at least one Evidence attachment\n  </p>\n);\n`,
  "jsx-text-nbsp.tsx": `export const X = () => <p>confirmed&nbsp;requires&#160;evidence</p>;\n`,
  "jsx-text-nested.tsx": `export const X = () => <div><span>Cannot save</span><p>confirmed requires evidence</p></div>;\n`,
  "jsx-attribute.tsx": `export const X = () => <p title="${MSG}">a</p>;\n`,
  "jsx-expression.tsx": `export const X = () => <p>{\`${MSG}\`}</p>;\n`,
  "tsx.tsx": `export const X = () => <p>{"${MSG}"}</p>;\n`,
} as const;

const OK = {
  "import-constant.ts": `import { CONFIRMED_REQUIRES_EVIDENCE } from "@watchdog/policy";\nexport const m = CONFIRMED_REQUIRES_EVIDENCE;\n`,
  "web-subpath.ts": `import { CONFIRMED_REQUIRES_EVIDENCE } from "@watchdog/policy/confirmed-evidence";\nexport const m = \`\${CONFIRMED_REQUIRES_EVIDENCE}!\`;\n`,
  "aliased.ts": `import { CONFIRMED_REQUIRES_EVIDENCE as MSG } from "@watchdog/policy/confirmed-evidence";\nexport const m = "Error: " + MSG;\n`,
  "namespace.ts": `import * as ce from "@watchdog/policy/confirmed-evidence";\nexport const m = ce.CONFIRMED_REQUIRES_EVIDENCE;\n`,
  "violation-fn.ts": `import { confirmedEvidenceViolation } from "@watchdog/policy/confirmed-evidence";\nexport const m = confirmedEvidenceViolation({ confidence: "confirmed", evidenceCount: 0 });\n`,
  "imported-concat.ts": `import { CONFIRMED_REQUIRES_EVIDENCE as MSG } from "@watchdog/policy/confirmed-evidence";\nconst A = "Error: ";\nexport const m = A + MSG + " (blocked)";\n`,
  "unrelated-confirmed.ts": `export const m = "A confirmed claim is final";\n`,
  "unrelated-requires.ts": `export const m = "This action requires at least one Case";\n`,
  "evidence-copy.ts": `export const m = "Attach Evidence to every claim";\n`,
  "split-by-unknown.ts": `export const f = (x: string) => "confirmed requires " + x + "evidence";\n`,
  "split-by-call.ts": `export const f = (x: string) => \`confirmed requires \${x.trim()} evidence\`;\n`,
  "other-requires.ts": `export const m = "confirmed requires a Case";\n`,
  "scoped-ok.ts": `export function a() {\n  const lead = "confirmed requires ";\n  return lead;\n}\nexport function b() {\n  const lead = "ok ";\n  return lead + "evidence";\n}\n`,
  "let-reassigned.ts": `let lead = "confirmed requires ";\nlead = "ok ";\nexport const m = lead + "evidence";\n`,
  "let-appended.ts": `let lead = "confirmed requires ";\nlead += "x";\nexport const m = lead + "evidence";\n`,
  "let-reassigned-later.ts": `let lead = "confirmed requires ";\nexport const m = () => lead + "evidence";\nexport const set = () => {\n  lead = "ok ";\n};\n`,
  "var-reassigned.ts": `var lead = "confirmed requires ";\nlead = "ok ";\nexport const m = lead + "evidence";\n`,
  "let-for-of.ts": `let lead = "confirmed requires ";\nfor (lead of ["a"]) { void lead; }\nexport const m = lead + "evidence";\n`,
  "let-destructured-assign.ts": `let lead = "confirmed requires ";\n[lead] = ["ok "];\nexport const m = lead + "evidence";\n`,
  "destructured-array.ts": `const [lead] = ["confirmed requires "];\nexport const m = lead + "evidence";\n`,
  "destructured-object.ts": `const { lead } = { lead: "confirmed requires " };\nexport const m = lead + "evidence";\n`,
  "jsx-text-valid.tsx": `export const X = () => <p>Attach Evidence to the claim; confirmed claims are final</p>;\n`,
  "jsx-split-elements.tsx": `export const X = () => <p><b>confirmed</b> requires evidence</p>;\n`,
  "jsx-constant.tsx": `import { CONFIRMED_REQUIRES_EVIDENCE } from "@watchdog/policy/confirmed-evidence";\nexport const X = () => <p>{CONFIRMED_REQUIRES_EVIDENCE}</p>;\n`,
  "join-unrelated.ts": `export const m = ["Accept", "needs", "a", "Case"].join(" ");\n`,
  "identifier-names.ts": `export const confirmedRequiresEvidence = true;\nexport const CONFIRMED_REQUIRES_EVIDENCE_FLAG = "x";\n`,
} as const;

beforeAll(() => {
  const fixture = createFixture();
  for (const [name, source] of Object.entries(FAIL)) {
    fixture.write(`${DIR}/${name}`, source);
  }
  for (const [name, source] of Object.entries(OK)) {
    fixture.write(`${DIR}/${name}`, source);
  }
  const literal = FAIL["exact.ts"];
  for (const scope of scopes) {
    fixture.write(`${scope}/src/probe.ts`, literal);
    fixture.write(`${scope}/src/__tests__/probe.test.ts`, literal);
    fixture.write(`${scope}/src/probe.tsx`, FAIL["jsx-text.tsx"]);
  }
  fixture.write(`${DIR}/__tests__/probe.test.ts`, literal);
  fixture.write(`${DIR}/probe.test.ts`, literal);
  fixture.write("packages/policy/src/confirmed-evidence.ts", literal);

  result = fixture.lint(["apps", "packages"]);
}, LINT_TIMEOUT_MS);

const hits = (file: string) => findingsFor(result, file, RULE);

describe("no re-implemented custody message (no-reimplemented-custody-message)", () => {
  it.each(Object.keys(FAIL))("rejects %s", (name) => {
    expect(hits(`${DIR}/${name}`)).toHaveLength(1);
  });

  it("points at the constant, both import paths and the convention, on the right line", () => {
    const [hit] = hits(`${DIR}/scoped.ts`);
    expect(hit?.message).toContain("CONFIRMED_REQUIRES_EVIDENCE");
    expect(hit?.message).toContain("confirmedEvidenceViolation");
    expect(hit?.message).toContain("@watchdog/policy/confirmed-evidence");
    expect(hit?.message).toContain("never the @watchdog/policy root");
    expect(hit?.message).toContain("conventions: one source per domain rule");
    expect(hit?.line).toBe(2);
  });

  it("reports a split message once, on the whole expression", () => {
    const [hit] = hits(`${DIR}/concat-chain.ts`);
    expect(hit?.line).toBe(1);
  });

  it.each(Object.keys(OK))("allows %s", (name) => {
    expect(hits(`${DIR}/${name}`)).toHaveLength(0);
  });

  it("scans every real app and package directory", () => {
    expect(scopes).toEqual(
      expect.arrayContaining(["apps/web", "apps/site", "packages/core"])
    );
  });

  it.each(scopes.filter((scope) => scope !== "packages/policy"))(
    "applies in %s, in source, tests and JSX text",
    (scope) => {
      expect(hits(`${scope}/src/probe.ts`), scope).toHaveLength(1);
      expect(hits(`${scope}/src/__tests__/probe.test.ts`), scope).toHaveLength(
        1
      );
      expect(hits(`${scope}/src/probe.tsx`), scope).toHaveLength(1);
    }
  );

  it("applies in tests beside the source", () => {
    expect(hits(`${DIR}/__tests__/probe.test.ts`)).toHaveLength(1);
    expect(hits(`${DIR}/probe.test.ts`)).toHaveLength(1);
  });

  it("exempts @watchdog/policy: source, tests and JSX text", () => {
    for (const file of [
      "packages/policy/src/confirmed-evidence.ts",
      "packages/policy/src/probe.ts",
      "packages/policy/src/__tests__/probe.test.ts",
      "packages/policy/src/probe.tsx",
    ]) {
      expect(hits(file), file).toHaveLength(0);
    }
  });
});
