#!/usr/bin/env node
/**
 * Writes the token region of DESIGN.md's front matter (`colors`, `typography`, `rounded`, between
 * the `# BEGIN GENERATED design tokens` / `# END GENERATED design tokens` comments) from the CSS,
 * which wins: `apps/web/src/styles/wd-dark.css` (dark), `wd-tokens.css` (light, ramps, `--radius`),
 * `wd-theme.css` (font families, `--radius-*`, `text-2xs`) and Tailwind's own `theme.css` (the
 * text, weight, leading and tracking scale). Everything outside the region stays hand-written.
 * CI regenerates and fails on a diff (`gates` job, "DESIGN.md token drift").
 *
 *   node scripts/generate-design-tokens.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const STYLES = "apps/web/src/styles";
const TAILWIND = "apps/web/node_modules/tailwindcss/theme.css";
const FILE = "DESIGN.md";
const BEGIN = "# BEGIN GENERATED design tokens";
const END = "# END GENERATED design tokens";

/**
 * Role -> CSS custom property. A color token names the role; `light-*` reads the light scope.
 * @type {Record<string, string>}
 */
const COLORS = {
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
/** Light tokens, in the order DESIGN.md lists them. */
const LIGHT_ORDER = [
  "background",
  "foreground",
  "muted",
  "muted-foreground",
  "surface-raised",
  "primary",
  "on-primary",
  "ring",
  "signal",
  "success",
  "destructive",
];

/**
 * Typography roles as the Tailwind utilities the UI renders them with: `text-<size>`,
 * `font-<weight>`, `leading-<leading>` (omitted: the size's own line height; `none` is 1),
 * `tracking-<tracking>`.
 * @type {Record<string, { family: "sans" | "mono", size: string, weight: string, leading?: string, tracking?: string }>}
 */
const TYPOGRAPHY = {
  "dossier-heading": {
    family: "sans",
    size: "2xl",
    weight: "semibold",
    leading: "tight",
    tracking: "tight",
  },
  "page-heading": {
    family: "sans",
    size: "xl",
    weight: "semibold",
    leading: "tight",
    tracking: "tight",
  },
  "section-heading": {
    family: "sans",
    size: "base",
    weight: "medium",
    leading: "snug",
  },
  "body-md": {
    family: "sans",
    size: "base",
    weight: "normal",
    leading: "normal",
  },
  "body-sm": {
    family: "sans",
    size: "sm",
    weight: "normal",
    leading: "normal",
  },
  label: { family: "sans", size: "sm", weight: "normal", leading: "tight" },
  "meta-label": { family: "sans", size: "2xs", weight: "normal" },
  "meta-label-sm": {
    family: "sans",
    size: "xs",
    weight: "normal",
    leading: "tight",
  },
  "mono-value": {
    family: "mono",
    size: "sm",
    weight: "normal",
    leading: "tight",
  },
  "mono-value-sm": { family: "mono", size: "2xs", weight: "normal" },
  chip: { family: "sans", size: "2xs", weight: "normal", leading: "none" },
};

const ROUNDED = ["sm", "md", "lg"];

/** @param {string} value */
const norm = (value) => value.replaceAll(/\s+/g, " ").trim();

/**
 * Custom properties of a stylesheet; the first declaration of a name wins.
 * @param {string} file
 * @returns {Map<string, string>}
 */
function declarations(file) {
  const css = readFileSync(file, "utf-8").replaceAll(/\/\*[\s\S]*?\*\//g, "");
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const [, name, value] of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (!out.has(name)) out.set(name, norm(value));
  }
  return out;
}

const light = declarations(`${STYLES}/wd-tokens.css`);
const dark = declarations(`${STYLES}/wd-dark.css`);
const theme = declarations(`${STYLES}/wd-theme.css`);
const tailwind = declarations(TAILWIND);

/** @type {string[]} */
const problems = [];

/**
 * A variable's value with `var()` references followed, looked up in `scopes` in order.
 * @param {string} name
 * @param {Map<string, string>[]} scopes
 * @returns {string}
 */
function resolve(name, scopes) {
  const raw = scopes.find((scope) => scope.has(name))?.get(name);
  if (raw === undefined) {
    problems.push(`${name} is not declared`);
    return "";
  }
  const ref = /^var\((--[\w-]+)\)$/.exec(raw);
  return ref ? resolve(ref[1], scopes) : raw;
}

/**
 * A number with its unit (`rem`, `em`, or none; px becomes rem): literals, `var()` and
 * `calc(a * b)` / `calc(a / b)`.
 * @param {string} raw
 * @param {Map<string, string>[]} scopes
 * @returns {{ value: number, unit: string }}
 */
function evaluate(raw, scopes) {
  const ref = /^var\((--[\w-]+)\)$/.exec(raw);
  if (ref) return evaluate(resolve(ref[1], scopes), scopes);
  const calc = /^calc\((.+?)\s*([*/])\s*(.+)\)$/.exec(raw);
  if (calc) {
    const a = evaluate(norm(calc[1]), scopes);
    const b = evaluate(norm(calc[3]), scopes);
    const value = calc[2] === "*" ? a.value * b.value : a.value / b.value;
    return { value, unit: a.unit || b.unit };
  }
  const num = /^(-?[\d.]+)(rem|em|px)?$/.exec(raw);
  if (!num) {
    problems.push(`cannot evaluate ${raw}`);
    return { value: Number.NaN, unit: "" };
  }
  return num[2] === "px"
    ? { value: Number(num[1]) / 16, unit: "rem" }
    : { value: Number(num[1]), unit: num[2] ?? "" };
}

/**
 * @param {string} name
 * @param {Map<string, string>[]} scopes
 */
function measure(name, scopes) {
  const { value, unit } = evaluate(resolve(name, scopes), scopes);
  return `${Number(value.toFixed(6))}${unit}`;
}

// Our CSS wins over Tailwind's defaults (both declare `--radius`, `--font-sans`, ...).
const themeScopes = [theme, light, tailwind];

/** @param {string} name */
const firstFamily = (name) =>
  (resolve(name, themeScopes).split(",")[0] ?? "")
    .replaceAll(/["']/g, "")
    .trim();

/** @param {(typeof TYPOGRAPHY)[string]} role */
function lineHeight(role) {
  if (role.leading === "none") return "1";
  return role.leading === undefined
    ? measure(`--text-${role.size}--line-height`, themeScopes)
    : measure(`--leading-${role.leading}`, themeScopes);
}

const lines = [
  BEGIN,
  "# Written by `pnpm generate:design` from the CSS; do not edit by hand.",
  "colors:",
  "  # Dark theme (primary scene): apps/web/src/styles/wd-dark.css",
  ...Object.entries(COLORS).map(
    ([token, cssVar]) => `  ${token}: "${resolve(cssVar, [dark, light])}"`
  ),
  "  # Light theme: apps/web/src/styles/wd-tokens.css",
  ...LIGHT_ORDER.map(
    (token) => `  light-${token}: "${resolve(COLORS[token] ?? token, [light])}"`
  ),
  "typography:",
  "  # Tailwind's text-*, font-*, leading-* and tracking-* scale (tailwindcss/theme.css); text-2xs and the families (--font-sans / --font-mono) from wd-theme.css. Sizes are rem, so they scale with --wd-display-scale.",
  ...Object.entries(TYPOGRAPHY).flatMap(([token, role]) => [
    `  ${token}:`,
    `    fontFamily: ${firstFamily(`--font-${role.family}`)}`,
    `    fontSize: ${measure(`--text-${role.size}`, themeScopes)}`,
    `    fontWeight: ${measure(`--font-weight-${role.weight}`, themeScopes)}`,
    `    lineHeight: ${lineHeight(role)}`,
    ...(role.tracking === undefined
      ? []
      : [
          `    letterSpacing: ${measure(`--tracking-${role.tracking}`, themeScopes)}`,
        ]),
  ]),
  "rounded:",
  `  # --radius-* in wd-theme.css: calc() of --radius (${measure("--radius", [light])}) in wd-tokens.css. full is Tailwind's rounded-full.`,
  ...ROUNDED.map(
    (step) => `  ${step}: ${measure(`--radius-${step}`, themeScopes)}`
  ),
  "  full: 9999px",
  END,
];

const doc = readFileSync(FILE, "utf-8");
const start = doc.indexOf(`${BEGIN}\n`);
const end = doc.indexOf(`${END}\n`);
if (start === -1 || end < start) {
  problems.push(`${FILE} has no "${BEGIN}" ... "${END}" region`);
}

if (problems.length > 0) {
  console.error("generate:design: cannot write the DESIGN.md tokens:");
  for (const p of new Set(problems)) console.error(`  - ${p}`);
  process.exit(1);
}

writeFileSync(
  FILE,
  `${doc.slice(0, start)}${lines.join("\n")}\n${doc.slice(end + END.length + 1)}`
);
console.log("generate:design: wrote the DESIGN.md token region");
