import { describe, expect, it } from "vitest";
import { stringify } from "yaml";

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
  "light-surface-raised": "--popover",
  "light-primary": "--primary",
  "light-on-primary": "--primary-foreground",
  "light-ring": "--ring",
  "light-signal": "--signal",
  "light-success": "--success",
  "light-destructive": "--destructive",
};
const WIDTH = "16rem";
const DARK_HEX = "#111111";
const LIGHT_HEX = "#eeeeee";
const SANS = '"Geist Variable", sans-serif';
const MONO = '"Geist Mono Variable", ui-monospace, monospace';
const SANS_TOKENS = [
  "dossier-heading",
  "page-heading",
  "section-heading",
  "body-md",
  "body-sm",
  "label",
  "meta-label",
  "meta-label-sm",
  "chip",
];
const MONO_TOKENS = ["mono-value", "mono-value-sm"];

function cssFor(map: Record<string, string>, hex: string, extra = "") {
  const vars = [...new Set(Object.values(map))];
  return `:root {\n${vars.map((v) => `  ${v}: ${hex};`).join("\n")}\n${extra}}\n`;
}

type ThemeCss = {
  sans?: string;
  mono?: string;
  width?: string;
  text2xs?: string;
};

function themeCss({
  sans = SANS,
  mono = MONO,
  width = WIDTH,
  text2xs = "0.8125rem",
}: ThemeCss = {}) {
  return `@theme inline {
  --container-filter-menu: ${width};
  --font-sans: ${sans};
  --font-mono: ${mono};
  --radius-sm: calc(var(--radius) * 0.5); /* 3px */
  --radius-md: var(--radius);
  --radius-lg: calc(var(--radius) * 1.5);
  --text-2xs: ${text2xs};
  --text-2xs--line-height: 1.25;
}
`;
}

function typographyFor() {
  const token = (family: string, size: string, lineHeight: number) => ({
    fontFamily: family,
    fontSize: size,
    fontWeight: 400,
    lineHeight,
  });
  return {
    "dossier-heading": token("Geist Variable", "1.5rem", 1.25),
    "page-heading": token("Geist Variable", "1.25rem", 1.25),
    "section-heading": token("Geist Variable", "1rem", 1.375),
    "body-md": token("Geist Variable", "1rem", 1.5),
    "body-sm": token("Geist Variable", "0.875rem", 1.5),
    label: token("Geist Variable", "0.875rem", 1.25),
    "meta-label": token("Geist Variable", "0.8125rem", 1.25),
    "meta-label-sm": token("Geist Variable", "0.75rem", 1.25),
    "mono-value": token("Geist Mono Variable", "0.875rem", 1.25),
    "mono-value-sm": token("Geist Mono Variable", "0.8125rem", 1.25),
    chip: token("Geist Variable", "0.8125rem", 1),
  };
}

type Node = Record<string, unknown>;

/** Walk to the parent object of a dotted path (`rounded.sm` -> `rounded`) and name the leaf key. */
function parentOf(tree: Node, dotted: string): [Node, string] {
  const parts = dotted.split(".");
  let node = tree;
  for (const p of parts.slice(0, -1)) node = node[p] as Node;
  return [node, parts.at(-1) ?? ""];
}

/** Delete a dotted path (`rounded.sm`, `typography.chip.fontSize`) from a tree. */
function drop(tree: Node, dotted: string) {
  const [node, key] = parentOf(tree, dotted);
  Reflect.deleteProperty(node, key);
}

/** Set a dotted path in a tree. */
function put(tree: Node, dotted: string, value: string) {
  const [node, key] = parentOf(tree, dotted);
  node[key] = value;
}

function designMd(overrides: Record<string, string> = {}, omit: string[] = []) {
  const tree: Node = {
    colors: {
      ...Object.fromEntries(Object.keys(DARK).map((k) => [k, DARK_HEX])),
      ...Object.fromEntries(Object.keys(LIGHT).map((k) => [k, LIGHT_HEX])),
    },
    typography: typographyFor(),
    rounded: {
      sm: "0.1875rem",
      md: "0.375rem",
      lg: "0.5625rem",
      full: "9999px",
    },
    components: { "filter-menu": { width: WIDTH } },
  };
  for (const [path, value] of Object.entries(overrides)) put(tree, path, value);
  for (const path of omit) drop(tree, path);
  return `---\n${stringify(tree)}---\n\n# Design\n`;
}

function repoWith(design: string, theme: ThemeCss = {}, radius = "0.375rem") {
  const repo = createGateRepo([GATE]);
  repo.write("DESIGN.md", design);
  repo.write(
    "apps/web/src/styles/wd-tokens.css",
    cssFor(LIGHT, LIGHT_HEX, `  --radius: ${radius};\n`)
  );
  repo.write("apps/web/src/styles/wd-dark.css", cssFor(DARK, DARK_HEX));
  repo.write("apps/web/src/styles/wd-theme.css", themeCss(theme));
  return repo;
}

describe("check-design-tokens gate", () => {
  it("passes when DESIGN.md matches the CSS", () => {
    const res = repoWith(designMd()).run(GATE);

    expect(res.code).toBe(0);
    expect(res.output).toContain("check:design-tokens: ok");
  });

  it("fails naming the token when a DESIGN.md color drifted from the CSS", () => {
    const res = repoWith(designMd({ "colors.primary": "#abcdef" })).run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("colors.primary");
    expect(res.output).toContain("#abcdef");
  });

  it("fails when DESIGN.md is missing a color", () => {
    const res = repoWith(designMd({}, ["colors.light-signal"])).run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("DESIGN.md is missing colors.light-signal");
  });

  it("fails when a light-only color (ring) drifted", () => {
    const res = repoWith(designMd({ "colors.light-ring": "#abcdef" })).run(
      GATE
    );

    expect(res.code).toBe(1);
    expect(res.output).toContain("colors.light-ring");
  });

  it("fails naming the component when a width drifted from the theme CSS", () => {
    const res = repoWith(
      designMd({ "components.filter-menu.width": "20rem" })
    ).run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("components.filter-menu.width");
    expect(res.output).toContain("20rem");
  });

  it("fails when DESIGN.md is missing the width", () => {
    const res = repoWith(designMd({}, ["components.filter-menu"])).run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain(
      "DESIGN.md is missing components.filter-menu.width"
    );
  });

  it("fails when the CSS width changed and DESIGN.md did not", () => {
    const res = repoWith(designMd(), { width: "18rem" }).run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("components.filter-menu.width");
  });

  it("fails naming the level when a rounded token drifted", () => {
    const res = repoWith(designMd({ "rounded.sm": "0.25rem" })).run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("rounded.sm");
    expect(res.output).toContain("0.25rem");
  });

  it("accepts a rounded value written in px when it is the same length", () => {
    const res = repoWith(
      designMd({
        "rounded.sm": "3px",
        "rounded.md": "6px",
        "rounded.lg": "9px",
      })
    ).run(GATE);

    expect(res.code).toBe(0);
  });

  it("fails every derived radius when the CSS --radius base changes", () => {
    const res = repoWith(designMd(), {}, "0.5rem").run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("rounded.sm");
    expect(res.output).toContain("rounded.md");
    expect(res.output).toContain("rounded.lg");
  });

  it("fails when DESIGN.md is missing a rounded level", () => {
    const res = repoWith(designMd({}, ["rounded.lg"])).run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("DESIGN.md is missing rounded.lg");
  });

  it.each([...SANS_TOKENS, ...MONO_TOKENS])(
    "fails when %s names a font family the CSS does not",
    (token) => {
      const res = repoWith(
        designMd({ [`typography.${token}.fontFamily`]: "Courier New" })
      ).run(GATE);

      expect(res.code).toBe(1);
      expect(res.output).toContain(`typography.${token}.fontFamily`);
    }
  );

  it("fails when a mono token names the sans family", () => {
    const res = repoWith(
      designMd({ "typography.mono-value.fontFamily": "Geist Variable" })
    ).run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("typography.mono-value.fontFamily");
  });

  it("fails when the CSS font family changed and DESIGN.md did not", () => {
    const res = repoWith(designMd(), {
      sans: '"Inter Variable", sans-serif',
    }).run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("typography.body-md.fontFamily");
    expect(res.output).toContain("inter variable");
  });

  it("fails when DESIGN.md is missing a typography token", () => {
    const res = repoWith(designMd({}, ["typography.chip"])).run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain(
      "DESIGN.md is missing typography.chip.fontFamily"
    );
  });

  it.each(["meta-label", "mono-value-sm", "chip"])(
    "fails when %s drifts from the theme's text-2xs size",
    (token) => {
      const res = repoWith(
        designMd({ [`typography.${token}.fontSize`]: "0.75rem" })
      ).run(GATE);

      expect(res.code).toBe(1);
      expect(res.output).toContain(`typography.${token}.fontSize`);
    }
  );

  it("fails when the theme's text-2xs size changed and DESIGN.md did not", () => {
    const res = repoWith(designMd(), { text2xs: "0.875rem" }).run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("typography.meta-label.fontSize");
  });

  it("fails when a text-2xs token's line height drifted", () => {
    const res = repoWith(
      designMd({ "typography.mono-value-sm.lineHeight": "1.5" })
    ).run(GATE);

    expect(res.code).toBe(1);
    expect(res.output).toContain("typography.mono-value-sm.lineHeight");
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
