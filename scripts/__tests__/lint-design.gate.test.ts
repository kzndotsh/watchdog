import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const GATE = "lint-design.mjs";

/** A minimal DESIGN.md the official linter accepts with no error and no warning (infos only). */
const CLEAN = `---
version: alpha
name: Fixture
colors:
  primary: "#112233"
  on-primary: "#ffffff"
  background: "#ffffff"
  foreground: "#000000"
typography:
  body-md:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
rounded:
  md: 0.375rem
omitted:
  - section: spacing
    reason: "fixture"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    typography: "{typography.body-md}"
  surface:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
---

# Fixture

## Overview

Fixture.
`;

function run(design: string) {
  const repo = createGateRepo([GATE]);
  repo.write("DESIGN.md", design);
  return repo.run(GATE);
}

describe("lint-design gate", () => {
  it("passes when the linter reports only infos", () => {
    const res = run(CLEAN);

    expect(res.code).toBe(0);
    expect(res.output).toContain("lint:design: ok");
  });

  it("fails on a warning, which the CLI itself exits 0 for (a contrast failure)", () => {
    const res = run(
      CLEAN.replace('foreground: "#000000"', 'foreground: "#f5f5f5"')
    );

    expect(res.code).toBe(1);
    expect(res.output).toContain("contrast ratio");
    expect(res.output).toContain("1 warning");
  });

  it("fails on a warning for a token map the schema ignores", () => {
    const res = run(
      CLEAN.replace("omitted:", 'widths:\n  menu: "16rem"\nomitted:')
    );

    expect(res.code).toBe(1);
    expect(res.output).toContain("widths");
  });

  it("fails on an error (a reference to a token that does not exist)", () => {
    const res = run(
      CLEAN.replace("{colors.on-primary}", "{colors.does-not-exist}")
    );

    expect(res.code).toBe(1);
    expect(res.output).toContain("lint:design:");
  });

  it("fails when the file cannot be read", () => {
    const repo = createGateRepo([GATE]);

    const res = repo.run(GATE);

    expect(res.code).toBe(1);
  });
});
