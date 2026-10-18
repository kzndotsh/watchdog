#!/usr/bin/env node
/**
 * Fails when a DESIGN.md front-matter value that has a CSS source differs from it. CSS
 * (apps/web/src/styles/wd-tokens.css = light + ramps, wd-dark.css = dark, wd-theme.css =
 * radius, widths, fonts, text-2xs) is the source of truth; DESIGN.md is a hand-kept
 * snapshot for agents. Checked: every `colors` token, `rounded.sm|md|lg`,
 * `components.filter-menu.width`, each `typography` `fontFamily`, and the text-2xs size
 * and line height. Format conformance and contrast are the official linter's job
 * (`pnpm lint:design`).
 */
import { readFileSync } from "node:fs";

import { parse } from "yaml";

const STYLES = "apps/web/src/styles";

/** DESIGN.md color token -> CSS custom property. Dark tokens are unprefixed. */
const DARK = {
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
const LIGHT = {
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

/** DESIGN.md `rounded` token -> CSS theme variable. Values are `calc()` of `--radius`, compared in rem. */
const ROUNDED = {
  sm: "--radius-sm",
  md: "--radius-md",
  lg: "--radius-lg",
};

/**
 * DESIGN.md `components.<name>.width` -> CSS theme variable (`--container-*` backs `w-<name>`
 * and `max-w-<name>` in Tailwind v4).
 */
const WIDTHS = {
  "filter-menu": "--container-filter-menu",
};

/** DESIGN.md `typography` token -> the font family variable its `fontFamily` must name (first family). */
const SANS = "--font-sans";
const MONO = "--font-mono";
const FAMILIES = {
  "dossier-heading": SANS,
  "page-heading": SANS,
  "section-heading": SANS,
  "body-md": SANS,
  "body-sm": SANS,
  label: SANS,
  "meta-label": SANS,
  "meta-label-sm": SANS,
  "mono-value": MONO,
  "mono-value-sm": MONO,
  chip: SANS,
};
/** Typography tokens set in the theme's own `text-2xs` step (size), and those that keep its line height. */
const TEXT_2XS_SIZE = ["meta-label", "mono-value-sm", "chip"];
const TEXT_2XS_LEADING = ["meta-label", "mono-value-sm"];

/** @param {string} value */
const norm = (value) => value.replaceAll(/\s+/g, " ").trim().toLowerCase();

/**
 * @param {string} css
 * @returns {Map<string, string>}
 */
function declarations(css) {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (!out.has(name)) out.set(name, norm(value));
  }
  return out;
}

/**
 * @param {string} name
 * @param {Map<string, string>} scope
 * @param {Map<string, string>} base
 * @returns {string | undefined}
 */
function resolve(name, scope, base) {
  const raw = scope.get(name) ?? base.get(name);
  const ref = raw === undefined ? null : /^var\((--[\w-]+)\)$/.exec(raw);
  return ref ? resolve(ref[1], scope, base) : raw;
}

const light = declarations(readFileSync(`${STYLES}/wd-tokens.css`, "utf-8"));
const dark = declarations(readFileSync(`${STYLES}/wd-dark.css`, "utf-8"));
const theme = declarations(readFileSync(`${STYLES}/wd-theme.css`, "utf-8"));

/**
 * @param {string | undefined} raw a CSS value or DESIGN.md dimension
 * @param {Map<string, string>} scope
 * @returns {number} rem (a bare number stays a number), NaN when not evaluable
 */
function toRem(raw, scope) {
  if (raw === undefined) return Number.NaN;
  const ref = /^var\((--[\w-]+)\)$/.exec(raw);
  if (ref) return toRem(resolve(ref[1], scope, light), scope);
  const calc = /^calc\((.+?)\s*\*\s*(.+)\)$/.exec(raw);
  if (calc) return toRem(norm(calc[1]), scope) * toRem(norm(calc[2]), scope);
  const num = /^(-?[\d.]+)(rem|px)?$/.exec(raw);
  if (!num) return Number.NaN;
  return num[2] === "px" ? Number(num[1]) / 16 : Number(num[1]);
}

/**
 * @param {unknown} node
 * @param {string} prefix
 * @param {Map<string, string>} out
 */
function flatten(node, prefix, out) {
  if (node !== null && typeof node === "object" && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node)) {
      flatten(v, prefix === "" ? k : `${prefix}.${k}`, out);
    }
  } else if (typeof node === "string" || typeof node === "number") {
    out.set(prefix, norm(String(node)));
  }
}

const front =
  /^---\n([\s\S]*?)\n---/.exec(readFileSync("DESIGN.md", "utf-8"))?.[1] ?? "";
/** @type {Map<string, string>} dotted front-matter path -> normalized value */
const doc = new Map();
flatten(parse(front), "", doc);

/**
 * First family of a CSS `font-family` list, unquoted.
 * @param {string} value
 */
const firstFamily = (value) =>
  (value.split(",")[0] ?? "").replaceAll(/["']/g, "").trim();

/** @type {string[]} */
const problems = [];
/**
 * @param {string} path dotted DESIGN.md front-matter path
 * @param {string} cssVar
 * @param {Map<string, string>} scope
 * @param {"text" | "rem" | "family"} kind how the two sides compare
 */
const check = (path, cssVar, scope, kind) => {
  const have = doc.get(path);
  const css = resolve(cssVar, scope, light);
  if (have === undefined) {
    problems.push(`DESIGN.md is missing ${path}`);
    return;
  }
  if (css === undefined) {
    problems.push(`${cssVar} not found for ${path}`);
    return;
  }
  let same = have === css;
  let shown = css;
  if (kind === "rem") {
    const want = toRem(css, scope);
    same = Math.abs(toRem(have, scope) - want) < 1e-6;
    shown = Number.isNaN(want) ? css : `${want}rem (${css})`;
  } else if (kind === "family") {
    shown = firstFamily(css);
    same = firstFamily(have).toLowerCase() === shown.toLowerCase();
  }
  if (!same)
    problems.push(`${path}: DESIGN.md has ${have}, CSS ${cssVar} is ${shown}`);
};

/**
 * @param {Record<string, string>} map DESIGN.md token -> CSS custom property
 * @param {Map<string, string>} scope
 * @param {(token: string) => string} pathOf
 * @param {"text" | "rem" | "family"} kind
 */
const checkAll = (map, scope, pathOf, kind) => {
  for (const [token, cssVar] of Object.entries(map))
    check(pathOf(token), cssVar, scope, kind);
};

checkAll(DARK, dark, (t) => `colors.${t}`, "text");
checkAll(LIGHT, light, (t) => `colors.${t}`, "text");
checkAll(ROUNDED, theme, (t) => `rounded.${t}`, "rem");
checkAll(WIDTHS, theme, (t) => `components.${t}.width`, "text");
checkAll(FAMILIES, theme, (t) => `typography.${t}.fontFamily`, "family");
for (const token of TEXT_2XS_SIZE)
  check(`typography.${token}.fontSize`, "--text-2xs", theme, "rem");
for (const token of TEXT_2XS_LEADING)
  check(
    `typography.${token}.lineHeight`,
    "--text-2xs--line-height",
    theme,
    "rem"
  );

if (problems.length > 0) {
  console.error(
    "check:design-tokens: DESIGN.md has drifted from the CSS (CSS wins):"
  );
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("check:design-tokens: ok");
