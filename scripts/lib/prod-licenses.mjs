/**
 * Production dependency licenses, as `pnpm licenses list --json --prod` reports
 * them. Shared by `check-licenses.mjs` (the gate) and `generate-notices.mjs`.
 * `--input <file>` reads the same JSON from a file instead (gate fixtures).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Prebuilt native packages (esbuild, sharp, rollup ...) are installed per machine. */
const PLATFORM_BINARY =
  /(?:^|[-/])(?:linux|darwin|win32|freebsd|openbsd)-(?:x64|arm64|arm|ia32|riscv64|ppc64|s390x|loong64|musl|gnu)/;

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

/** @param {string} name */
export const isPlatformBinary = (name) => PLATFORM_BINARY.test(name);

/**
 * @param {readonly string[]} argv
 * @returns {{ name: string, version: string, license: string, homepage: string }[]}
 */
export function loadProdLicenses(argv) {
  const at = argv.indexOf("--input");
  let raw;
  if (at === -1) {
    const res = spawnSync("pnpm", ["licenses", "list", "--json", "--prod"], {
      encoding: "utf-8",
      maxBuffer: 256 * 1024 * 1024,
    });
    if (res.status !== 0) {
      throw new Error(`pnpm licenses list failed: ${res.stderr}`);
    }
    raw = res.stdout;
  } else {
    raw = readFileSync(argv[at + 1], "utf-8");
  }
  const rows = [];
  for (const [license, pkgs] of Object.entries(asRecord(JSON.parse(raw)))) {
    for (const entry of Array.isArray(pkgs) ? pkgs : []) {
      const pkg = asRecord(entry);
      const versions = Array.isArray(pkg.versions)
        ? pkg.versions.map(String)
        : [];
      rows.push({
        name: String(pkg.name),
        version: versions.sort().join(", "),
        license: typeof pkg.license === "string" ? pkg.license : license,
        homepage: typeof pkg.homepage === "string" ? pkg.homepage : "",
      });
    }
  }
  return rows.sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version)
  );
}
