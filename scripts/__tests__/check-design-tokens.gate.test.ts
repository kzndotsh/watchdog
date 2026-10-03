import { describe, expect, it } from "vitest";

import { gateRepoFactory } from "./helpers/gate-repo";

const createGateRepo = gateRepoFactory();

const GATE = "check-design-tokens.mjs";

// DESIGN.md token -> CSS custom property (the gate's documented contract).
const DARK: Record<string, string> = {
  background: "--background",
  foreground: "--foreground",
  "surface-raised": "--popover",
  muted: "--muted",
  "muted-foreground": "--muted-foreground",
  primary: "--primary",
  "on-primary": "--primary-foreground",
  ring: "--ring",
  signal: "--signal",
  success: "--success",
  destructive: "--destructive",
};
const LIGHT: Record<string, string> = {
  "light-background": "--background",
  "light-foreground": "--foreground",
  "light-muted": "--muted",
  "light-muted-foreground": "--muted-foreground",
  "light-primary": "--primary",
  "light-signal": "--signal",
  "light-success": "--success",
  "light-destructive": "--destructive",
};
const DARK_HEX = "#111111";
const LIGHT_HEX = "#eeeeee";

function cssFor(map: Record<string, string>, hex: string) {
  const vars = [...new Set(Object.values(map))];
  return `:root {\n${vars.map((v) => `  ${v}: ${hex};`).join("\n")}\n}\n`;
}

function designMd(overrides: Record<string, string> = {}, omit: string[] = []) {
  const entries = [
    ...Object.keys(DARK).map((k) => [k, DARK_HEX] as const),
    ...Object.keys(LIGHT).map((k) => [k, LIGHT_HEX] as const),
  ]
    .filter(([k]) => !omit.includes(k))
    .map(([k, v]) => `  ${k}: "${overrides[k] ?? v}"`);
  return `---\ncolors:\n${entries.join("\n")}\n---\n\n# Design\n`;
}

function repoWith(design: string) {
  const repo = createGateRepo([GATE]);
  repo.write("DESIGN.md", design);
  repo.write("apps/web/src/styles/wd-tokens.css", cssFor(LIGHT, LIGHT_HEX));
  repo.write("apps/web/src/styles/wd-dark.css", cssFor(DARK, DARK_HEX));
  return repo;
}

describe("check-design-tokens gate", () => {
  it("passes when DESIGN.md colors match the CSS", () => {
    const res = repoWith(designMd()).run(GATE);

    expect(res.code).toBe(0);
    expect(res.output).toContain("check:design-tokens: ok");
  });

  it("fails naming the token when a DESIGN.md color drifted from the CSS", () => {
    const res = repoWith(designMd({ primary: "#abcdef" })).run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("colors.primary");
    expect(res.output).toContain("#abcdef");
  });

  it("fails when DESIGN.md is missing a token", () => {
    const res = repoWith(designMd({}, ["light-signal"])).run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("DESIGN.md is missing colors.light-signal");
  });

  it("follows var() references in the CSS", () => {
    const repo = repoWith(designMd());
    repo.write(
      "apps/web/src/styles/wd-dark.css",
      cssFor(DARK, DARK_HEX).replace(
        "--ring: #111111;",
        "--ring: var(--background);"
      )
    );

    expect(repo.run(GATE).code).toBe(0);
  });
});
