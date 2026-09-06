#!/usr/bin/env node
/**
 * Pack `@watchdog/cli` as a self-contained tarball and prove install under /tmp.
 *
 * Usage:
 *   node apps/cli/scripts/pack-smoke.mjs
 *
 * Optional live check (needs pnpm dev:web + key):
 *   WD_API_URL=http://127.0.0.1:3000/api/v1 WD_API_KEY=… node apps/cli/scripts/pack-smoke.mjs --live
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const live = process.argv.includes("--live");
const cliRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(cliRoot, "../..");

/**
 * @param {string} text
 * @returns {unknown}
 */
function parseJson(text) {
  return JSON.parse(text);
}

/**
 * @param {unknown} value
 * @returns {value is { name: string; version: string; engines?: unknown }}
 */
function isPackageJson(value) {
  if (typeof value !== "object" || value === null) return false;
  if (!("name" in value) || !("version" in value)) return false;
  return typeof value.name === "string" && typeof value.version === "string";
}

/**
 * @param {unknown} value
 * @returns {value is { filename: string }[]}
 */
function isNpmPackList(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        "filename" in row &&
        typeof row.filename === "string"
    )
  );
}

/**
 * @param {unknown} value
 * @returns {value is { count: number }}
 */
function isCapsList(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    "count" in value &&
    typeof value.count === "number"
  );
}

execFileSync("node", [path.join(cliRoot, "scripts/build.mjs")], {
  cwd: cliRoot,
  stdio: "inherit",
});

const pkgRaw = parseJson(
  readFileSync(path.join(cliRoot, "package.json"), "utf-8")
);
if (!isPackageJson(pkgRaw)) {
  throw new Error("apps/cli/package.json missing name/version");
}
const pkg = pkgRaw;

const staging = mkdtempSync(path.join(tmpdir(), "wd-pack-src-"));
const installDir = mkdtempSync(path.join(tmpdir(), "wd-pack-install-"));

try {
  // Runtime artifact only — no workspace:* deps (bundle already inlined them).
  writeFileSync(
    path.join(staging, "package.json"),
    `${JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version,
        private: true,
        type: "module",
        bin: { wd: "./dist/main.js" },
        files: ["dist"],
        engines: pkg.engines,
      },
      null,
      2
    )}\n`
  );
  mkdirSync(path.join(staging, "dist"), { recursive: true });
  copyFileSync(
    path.join(cliRoot, "dist/main.js"),
    path.join(staging, "dist/main.js")
  );

  const packOut = execFileSync("npm", ["pack", "--json"], {
    cwd: staging,
    encoding: "utf-8",
  });
  const packed = parseJson(packOut);
  if (!isNpmPackList(packed) || packed.length === 0) {
    throw new Error(`npm pack did not return a filename: ${packOut}`);
  }
  const tarballName = packed[0].filename;
  const tarball = path.join(staging, tarballName);
  console.log(`packed ${tarball}`);

  execFileSync("npm", ["install", "--ignore-scripts", tarball], {
    cwd: installDir,
    stdio: "inherit",
  });

  const wdBin = path.join(installDir, "node_modules", ".bin", "wd");
  const help = spawnSync(wdBin, ["--help"], {
    encoding: "utf-8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
  });
  if (help.status !== 0) {
    throw new Error(`wd --help failed: ${help.stderr ?? help.stdout}`);
  }
  if (!help.stdout.includes("COMMANDS")) {
    throw new Error(`unexpected --help output: ${help.stdout}`);
  }
  console.log("ok: /tmp install wd --help");

  if (live) {
    const apiUrl = process.env.WD_API_URL;
    const apiKey = process.env.WD_API_KEY;
    if (!apiUrl || !apiKey) {
      throw new Error(
        "--live requires WD_API_URL and WD_API_KEY in the environment"
      );
    }
    const list = spawnSync(wdBin, ["caps", "list"], {
      encoding: "utf-8",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        WD_API_URL: apiUrl,
        WD_API_KEY: apiKey,
      },
    });
    if (list.status !== 0) {
      const preview = (list.stdout ?? list.stderr ?? "").slice(0, 400);
      throw new Error(`wd caps list failed (exit ${list.status}): ${preview}`);
    }
    const jsonLine =
      list.stdout
        .trim()
        .split("\n")
        .find((l) => l.startsWith("{")) ?? "null";
    const body = parseJson(jsonLine);
    if (!isCapsList(body)) {
      throw new Error(
        `unexpected caps list JSON: ${list.stdout.slice(0, 200)}`
      );
    }
    console.log(`ok: live caps list count=${body.count}`);
  } else {
    console.log(`skip live (from ${repoRoot}): pass --live with WD_API_* set`);
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
  rmSync(installDir, { recursive: true, force: true });
}
