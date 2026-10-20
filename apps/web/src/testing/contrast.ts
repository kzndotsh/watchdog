import { readFileSync } from "node:fs";
import path from "node:path";

/** WCAG 2.2 AA minimum for normal text. */
export const AA_TEXT = 4.5;

export type Theme = "light" | "dark";

const STYLES_DIR = path.resolve(import.meta.dirname, "../styles");

const OKLCH = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/;
const VAR = /^var\((--[\w-]+)\)$/;

type Rgb = readonly [number, number, number];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const encode = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
const gamma = (x: number) => clamp01(encode(clamp01(x)));
const decode = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

/** `oklch(L C H)` to gamma-encoded sRGB, clipped to the gamut (what a browser paints). */
export function oklchToSrgb(l: number, c: number, h: number): Rgb {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    gamma(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    gamma(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    gamma(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
  ];
}

function luminance([r, g, b]: Rgb): number {
  return 0.2126 * decode(r) + 0.7152 * decode(g) + 0.0722 * decode(b);
}

function parseOklch(value: string): Rgb {
  const m = OKLCH.exec(value.trim());
  if (!m) {
    throw new Error(`Not an opaque oklch() colour: ${value}`);
  }
  return oklchToSrgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** WCAG contrast ratio between two `oklch(L C H)` strings. */
export function contrastRatio(foreground: string, background: string): number {
  const x = luminance(parseOklch(foreground));
  const y = luminance(parseOklch(background));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function declarations(file: string, selector: string): Map<string, string> {
  const css = readFileSync(path.resolve(STYLES_DIR, file), "utf-8");
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    throw new Error(`${selector} block not found in ${file}`);
  }
  const body = css.slice(start, css.indexOf("\n}", start));
  const map = new Map<string, string>();
  for (const m of body.matchAll(/^\s*(--[\w-]+):\s*(.+?);\s*$/gm)) {
    map.set(m[1], m[2]);
  }
  return map;
}

/**
 * The `oklch(...)` value of a custom property as the browser resolves it: light is
 * `:root` in `wd-tokens.css`; dark is `.dark` in `wd-dark.css` over the light values.
 */
export function resolveToken(name: string, theme: Theme): string {
  const light = declarations("wd-tokens.css", ":root");
  const dark = theme === "dark" ? declarations("wd-dark.css", ".dark") : null;
  let current = `var(${name})`;
  for (let hops = 0; hops < 8; hops += 1) {
    const ref = VAR.exec(current);
    if (!ref) {
      return current;
    }
    const next = dark?.get(ref[1]) ?? light.get(ref[1]);
    if (next === undefined) {
      throw new Error(`${ref[1]} is not declared`);
    }
    current = next;
  }
  throw new Error(`${name} did not resolve to a colour`);
}

/** Contrast of one token on another in a theme, read from the CSS. */
export function tokenContrast(
  foreground: string,
  background: string,
  theme: Theme
): number {
  return contrastRatio(
    resolveToken(foreground, theme),
    resolveToken(background, theme)
  );
}
