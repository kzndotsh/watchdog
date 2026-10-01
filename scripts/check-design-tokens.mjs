#!/usr/bin/env node
/**
 * Fails when a color in DESIGN.md front matter differs from the CSS it summarizes.
 * CSS (apps/web/src/styles/wd-tokens.css = light + ramps, wd-dark.css = dark) is the
 * source of truth; DESIGN.md is a hand-kept snapshot for agents.
 */
import { readFileSync } from "node:fs";

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
  "light-primary": "--primary",
  "light-signal": "--signal",
  "light-success": "--success",
  "light-destructive": "--destructive",
};

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

const tokens = readFileSync(`${STYLES}/wd-tokens.css`, "utf-8");
const darkCss = readFileSync(`${STYLES}/wd-dark.css`, "utf-8");
const light = declarations(tokens);
const dark = declarations(darkCss);

const front =
  /^---\n([\s\S]*?)\n---/.exec(readFileSync("DESIGN.md", "utf-8"))?.[1] ?? "";
/** @type {Map<string, string>} */
const doc = new Map();
for (const [, name, value] of front.matchAll(/^ {2}([\w-]+):\s*"([^"]+)"/gm)) {
  doc.set(name, norm(value));
}

/** @type {string[]} */
const problems = [];
/**
 * @param {Record<string, string>} map
 * @param {Map<string, string>} scope
 */
const check = (map, scope) => {
  for (const [token, cssVar] of Object.entries(map)) {
    const want = resolve(cssVar, scope, light);
    const have = doc.get(token);
    if (have === undefined)
      problems.push(`DESIGN.md is missing colors.${token}`);
    else if (want === undefined)
      problems.push(`${cssVar} not found for colors.${token}`);
    else if (have !== want)
      problems.push(
        `colors.${token}: DESIGN.md has ${have}, CSS ${cssVar} is ${want}`
      );
  }
};
check(DARK, dark);
check(LIGHT, light);

if (problems.length > 0) {
  console.error(
    "check:design-tokens: DESIGN.md has drifted from the CSS (CSS wins):"
  );
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("check:design-tokens: ok");
