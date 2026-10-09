/**
 * Proves the real `oxlint.config.ts` enforces the web design-system bans that used to
 * live in `apps/web/scripts/ds-ban-check.mjs`: decorative classes (gradients, gradient
 * text, glass), banned screen names (Console / Workbench / Tape) and truncated opaque
 * ids in `domains/`. Probe files are written into a throwaway repo that carries the
 * real config and plugin (helpers/oxlint-fixture.ts).
 */
import { beforeAll, describe, expect, it } from "vitest";

import { findingsFor, oxlintFixtureFactory } from "./helpers/oxlint-fixture.ts";
import type { LintResult } from "./helpers/oxlint-fixture.ts";

const DECORATIVE = "watchdog/no-decorative-class";
const SURFACE = "watchdog/no-banned-surface-name";
const SLICE = "watchdog/no-opaque-id-slice";

const SRC = "apps/web/src";
const DOMAIN = `${SRC}/domains/cases`;
const JOBS = `${SRC}/domains/jobs`;

const createFixture = oxlintFixtureFactory();

let result: LintResult;

const DECORATIVE_CLASSES = [
  "bg-gradient-to-r from-a to-b",
  "bg-linear-to-r from-a to-b",
  "bg-radial from-a",
  "bg-conic from-a",
  "bg-clip-text text-transparent",
  "backdrop-blur",
  "backdrop-blur-sm",
] as const;

const jsx = (cls: string) => `export const x = <div className="${cls}" />;\n`;

const SURFACE_FAIL = {
  "fn-console.tsx": "export function CaseConsole() { return null; }\n",
  "fn-workbench.tsx": "export function EntityWorkbench() { return null; }\n",
  "fn-tape.tsx": "export function EvidenceTape() { return null; }\n",
  "const-console.tsx": "export const CaseConsole = () => null;\n",
  "bare-console.tsx": "export function Console() { return null; }\n",
} as const;

const SLICE_FAIL = {
  "sha256.ts": "export const s = (sha256: string) => sha256.slice(0, 8);\n",
  "jobId.ts": "export const s = (jobId: string) => jobId.slice(0, 12);\n",
  "proposalId.ts":
    "export const s = (proposalId: string) => proposalId.slice(0,8);\n",
  "entityId.ts":
    "export const s = (entityId: string) => entityId.slice( 0, 8 );\n",
  "bare-id.ts": "export const s = (id: string) => id.slice(0, 8);\n",
  "dot-id.ts":
    "export const s = (job: { id: string }) => job.id.slice(0, 8);\n",
} as const;

beforeAll(() => {
  const fixture = createFixture();

  for (const [i, cls] of DECORATIVE_CLASSES.entries()) {
    fixture.write(`${DOMAIN}/deco-${i}.tsx`, jsx(cls));
  }
  fixture.write(
    `${DOMAIN}/deco-template.tsx`,
    [
      "export const x = (a: string) =>",
      " `p-2 $",
      "{a} bg-gradient-to-r`;\n",
    ].join("")
  );
  fixture.write(
    `${DOMAIN}/deco-cn.tsx`,
    'declare const cn: (...a: string[]) => string;\nexport const x = cn("p-2", "backdrop-blur");\n'
  );
  fixture.write(`${DOMAIN}/deco-ok.tsx`, jsx("p-2 bg-muted backdrop"));
  fixture.write(
    `${DOMAIN}/deco-comment.tsx`,
    "// bg-gradient-to-r is banned\nexport const x = 1;\n"
  );
  fixture.write(
    `${DOMAIN}/deco-allowed.tsx`,
    `// ds:allow-decorative — functional blur behind a sticky header\n${jsx("backdrop-blur")}`
  );
  fixture.write(
    `${DOMAIN}/deco-allowed-hyphen.tsx`,
    `// ds:allow-decorative - reviewed\n${jsx("backdrop-blur")}`
  );
  fixture.write(
    `${DOMAIN}/deco-allow-no-reason.tsx`,
    `// ds:allow-decorative\n${jsx("backdrop-blur")}`
  );
  fixture.write(
    `${DOMAIN}/deco-allow-other-rule.tsx`,
    `// ds:allow-surface-name — wrong rule\n${jsx("backdrop-blur")}`
  );
  fixture.write(`${SRC}/shared/ui/primitives/glass.tsx`, jsx("backdrop-blur"));
  fixture.write(`${SRC}/auth/ui/glass.tsx`, jsx("backdrop-blur"));
  fixture.write("packages/core/src/probe/glass.tsx", jsx("backdrop-blur"));

  for (const [name, source] of Object.entries(SURFACE_FAIL)) {
    fixture.write(`${DOMAIN}/${name}`, source);
  }
  fixture.write(
    `${DOMAIN}/surface-ok.tsx`,
    "export function CaseList() { return null; }\nexport const ConsoleLog = 1;\nfunction LocalConsole() { return null; }\nexport { LocalConsole };\n"
  );
  fixture.write(
    `${DOMAIN}/surface-allowed.tsx`,
    "// ds:allow-surface-name — legacy export kept for one release\nexport function CaseConsole() { return null; }\n"
  );
  fixture.write(
    `${SRC}/shared/ui/surface.tsx`,
    "export function EvidenceTape() { return null; }\n"
  );

  for (const [name, source] of Object.entries(SLICE_FAIL)) {
    fixture.write(`${JOBS}/${name}`, source);
  }
  fixture.write(
    `${JOBS}/slice-ok.ts`,
    [
      "export const a = (when: string) => when.slice(0, 10);",
      "export const b = (d: Date) => d.toISOString().slice(0, 10);",
      "export const c = (capturedAt: string) => capturedAt.slice(0, 10);",
      "export const d = (id: string) => id.slice(2);",
      "export const e = (id: string) => id.slice(0, id.length - 1);",
      "export const f = (name: string) => name.slice(0, 8);",
      "",
    ].join("\n")
  );
  fixture.write(
    `${SRC}/shared/lib/slice-outside-domains.ts`,
    "export const s = (id: string) => id.slice(0, 8);\n"
  );

  result = fixture.lint([SRC, "packages"]);
});

const hits = (file: string, rule: string) => findingsFor(result, file, rule);

describe("decorative class ban (no-decorative-class)", () => {
  it.each(DECORATIVE_CLASSES.map((cls, i) => [cls, i] as const))(
    "rejects %s",
    (_cls, i) => {
      expect(hits(`${DOMAIN}/deco-${i}.tsx`, DECORATIVE)).toHaveLength(1);
    }
  );
  it("rejects a template literal and a cn() argument", () => {
    expect(hits(`${DOMAIN}/deco-template.tsx`, DECORATIVE)).toHaveLength(1);
    expect(hits(`${DOMAIN}/deco-cn.tsx`, DECORATIVE)).toHaveLength(1);
  });
  it("names the refuse list and the escape hatch, on the right line", () => {
    const [hit] = hits(`${DOMAIN}/deco-0.tsx`, DECORATIVE);
    expect(hit?.message).toContain("refuse list");
    expect(hit?.message).toContain("ds:allow-decorative");
    expect(hit?.line).toBe(1);
  });
  it("allows ordinary classes and comments that mention a banned class", () => {
    expect(hits(`${DOMAIN}/deco-ok.tsx`, DECORATIVE)).toHaveLength(0);
    expect(hits(`${DOMAIN}/deco-comment.tsx`, DECORATIVE)).toHaveLength(0);
  });
  it("honours a ds:allow-decorative comment with a reason on the line above", () => {
    expect(hits(`${DOMAIN}/deco-allowed.tsx`, DECORATIVE)).toHaveLength(0);
    expect(hits(`${DOMAIN}/deco-allowed-hyphen.tsx`, DECORATIVE)).toHaveLength(
      0
    );
  });
  it("ignores an allow comment without a reason or for another rule", () => {
    expect(hits(`${DOMAIN}/deco-allow-no-reason.tsx`, DECORATIVE)).toHaveLength(
      1
    );
    expect(
      hits(`${DOMAIN}/deco-allow-other-rule.tsx`, DECORATIVE)
    ).toHaveLength(1);
  });
  it("exempts shared/ui/primitives and auth/ui, and trees outside apps/web", () => {
    expect(
      hits(`${SRC}/shared/ui/primitives/glass.tsx`, DECORATIVE)
    ).toHaveLength(0);
    expect(hits(`${SRC}/auth/ui/glass.tsx`, DECORATIVE)).toHaveLength(0);
    expect(hits("packages/core/src/probe/glass.tsx", DECORATIVE)).toHaveLength(
      0
    );
  });
});

describe("banned surface name (no-banned-surface-name)", () => {
  it.each(Object.keys(SURFACE_FAIL))("rejects %s", (name) => {
    expect(hits(`${DOMAIN}/${name}`, SURFACE)).toHaveLength(1);
  });
  it("names the export and points at the layout-kind naming rule", () => {
    const [hit] = hits(`${DOMAIN}/fn-console.tsx`, SURFACE);
    expect(hit?.message).toContain("CaseConsole");
    expect(hit?.message).toContain("Queue + Detail");
    expect(hit?.line).toBe(1);
  });
  it("applies outside domains too", () => {
    expect(hits(`${SRC}/shared/ui/surface.tsx`, SURFACE)).toHaveLength(1);
  });
  it("allows ordinary names, a non-suffix match and unexported locals", () => {
    expect(hits(`${DOMAIN}/surface-ok.tsx`, SURFACE)).toHaveLength(0);
  });
  it("honours a ds:allow-surface-name comment with a reason on the line above", () => {
    expect(hits(`${DOMAIN}/surface-allowed.tsx`, SURFACE)).toHaveLength(0);
  });
});

describe("opaque id slice ban (no-opaque-id-slice)", () => {
  it.each(Object.keys(SLICE_FAIL))("rejects %s in domains/", (name) => {
    expect(hits(`${JOBS}/${name}`, SLICE)).toHaveLength(1);
  });
  it("points at IdChip / formatOpaqueId", () => {
    const [hit] = hits(`${JOBS}/bare-id.ts`, SLICE);
    expect(hit?.message).toContain("IdChip");
    expect(hit?.message).toContain("formatOpaqueId");
    expect(hit?.line).toBe(1);
  });
  it("allows date slices, other slice shapes and other names", () => {
    expect(hits(`${JOBS}/slice-ok.ts`, SLICE)).toHaveLength(0);
  });
  it("applies to domains/ only", () => {
    expect(
      hits(`${SRC}/shared/lib/slice-outside-domains.ts`, SLICE)
    ).toHaveLength(0);
  });
});
