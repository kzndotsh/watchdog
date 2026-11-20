import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const SCRIPT = "generate-design-tokens.mjs";
const STYLES = "apps/web/src/styles";
const TAILWIND = "apps/web/node_modules/tailwindcss/theme.css";
const repoRoot = path.resolve(import.meta.dirname, "../..");

const BEGIN = "# BEGIN GENERATED design tokens";
const END = "# END GENERATED design tokens";

const DESIGN = `---
version: alpha
name: Fixture
${BEGIN}
colors:
  background: "stale"
${END}
components:
  surface:
    backgroundColor: "{colors.background}"
---

# Fixture

Hand-written prose.
`;

/** A repo with the real CSS sources and a DESIGN.md whose token region is stale. */
function fixture(design = DESIGN) {
  const repo = createGateRepo([SCRIPT]);
  for (const file of ["wd-tokens.css", "wd-dark.css", "wd-theme.css"]) {
    repo.copyFromRepo(`${STYLES}/${file}`);
  }
  repo.write(TAILWIND, readFileSync(path.join(repoRoot, TAILWIND), "utf-8"));
  repo.write("DESIGN.md", design);
  return repo;
}

const read = (repo: { dir: string }, rel: string) =>
  readFileSync(path.join(repo.dir, rel), "utf-8");

describe("generate-design-tokens", () => {
  it("writes the token region from the CSS and keeps the rest", () => {
    const repo = fixture();
    expect(repo.run(SCRIPT).code).toBe(0);
    const out = read(repo, "DESIGN.md");

    // Dark color, light color through a var() ramp, calc() radius, families and text-2xs.
    expect(out).toContain('  background: "oklch(0.19 0.012 250)"');
    expect(out).toContain('  light-background: "oklch(0.985 0.004 250)"');
    expect(out).toContain("  sm: 0.1875rem");
    expect(out).toContain("    fontFamily: Geist Mono Variable");
    expect(out).toMatch(
      / {2}chip:\n {4}fontFamily: Geist Variable\n {4}fontSize: 0\.8125rem\n {4}fontWeight: 400\n {4}lineHeight: 1\n/
    );
    expect(out).not.toContain('"stale"');

    expect(out).toContain(`name: Fixture\n${BEGIN}\n`);
    expect(out).toContain(`${END}\ncomponents:\n`);
    expect(out).toContain("Hand-written prose.");
  });

  it("follows a CSS change and is a no-op when run twice", () => {
    const repo = fixture();
    const dark = read(repo, `${STYLES}/wd-dark.css`).replace(
      "--primary: oklch(0.72 0.12 220);",
      "--primary: oklch(0.7 0.1 200);"
    );
    repo.write(`${STYLES}/wd-dark.css`, dark);
    expect(repo.run(SCRIPT).code).toBe(0);
    const once = read(repo, "DESIGN.md");
    expect(once).toContain('  primary: "oklch(0.7 0.1 200)"');

    expect(repo.run(SCRIPT).code).toBe(0);
    expect(read(repo, "DESIGN.md")).toBe(once);
  });

  it("fails when DESIGN.md has no token region", () => {
    const repo = fixture(DESIGN.replace(`${BEGIN}\n`, ""));
    const res = repo.run(SCRIPT);
    expect(res.code).toBe(1);
    expect(res.output).toContain(BEGIN);
  });

  it("fails when a token's CSS variable is missing", () => {
    const repo = fixture();
    const theme = read(repo, `${STYLES}/wd-theme.css`).replace(
      /--text-2xs:[^;]+;/,
      ""
    );
    repo.write(`${STYLES}/wd-theme.css`, theme);
    const res = repo.run(SCRIPT);
    expect(res.code).toBe(1);
    expect(res.output).toContain("--text-2xs is not declared");
  });

  it("fails cleanly on a circular var() reference", () => {
    const repo = fixture();
    const theme = read(repo, `${STYLES}/wd-theme.css`).replace(
      /--text-2xs:[^;]+;/,
      "--text-2xs: var(--text-2xs);"
    );
    repo.write(`${STYLES}/wd-theme.css`, theme);
    const res = repo.run(SCRIPT);
    expect(res.code).toBe(1);
    expect(res.output).toContain("circular var() reference: --text-2xs");
  });
});
