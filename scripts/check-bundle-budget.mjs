#!/usr/bin/env node
/**
 * Bundle-size ratchet for the web app's production build.
 *
 * Reads the TanStack Start manifest in `<dist>/server/assets`, follows static imports
 * between client chunks, and gzips the JavaScript each route makes the browser download:
 *
 *   entry   the `__root__` preload closure (every page pays it)
 *   shell   entry + the `/_protected` closure (the signed-in shell)
 *   routes  per route, the chunks its closure adds on top of the shell
 *
 * The committed baseline (`scripts/bundle-budget-baseline.json`, gzip bytes) may shrink, never
 * grow: a metric more than 5% over its baseline fails. `--update` lowers baseline entries that
 * shrank, adds new routes and drops removed ones; it never raises a number. A deliberate
 * increase is a reviewed hand edit of the JSON. Total client JavaScript is reported, not
 * gated: it is mostly lazy syntax-highlighting grammars no route downloads up front.
 *
 * Chunk hashes in file names and references are masked before gzipping (`withoutHashes`), so a
 * change in one chunk cannot move the size of the chunks that import it.
 *
 * Usage: node scripts/check-bundle-budget.mjs [--dist <dir>] [--baseline <file>] [--update] [--json]
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

/** A metric fails when it exceeds its baseline by more than this fraction. */
export const TOLERANCE = 0.05;

const root = path.resolve(import.meta.dirname, "..");
const SHELL_ROUTE = "/_protected";
const ROOT_ROUTE = "__root__";

/** `import … from "./x.js"` and bare `import "./x.js"` between sibling chunks. */
const STATIC_IMPORT =
  /(?:^|[;\n}])\s*import\s*(?:[^"'()]*?from\s*)?["'](\.\/[^"']+\.js)["']/g;

/**
 * The 8-character content hash Rollup puts before the extension of a chunk file name
 * (`vendor-Dk3j_a-9.js`). Chunks name each other in imports and preload lists, so a change to
 * one chunk renames it and rewrites every chunk that points at it.
 */
const CHUNK_HASH = /(?<=-)[\w-]{8}(?=\.(?:js|css)\b)/g;

/**
 * A chunk's bytes with its references' hashes replaced by a constant of the same length. The
 * hashes are random, so they do not gzip: left in, an unrelated route change moved the shell
 * by a few bytes. Real code is untouched, so growth in it still counts in full.
 * @param {Buffer} source
 */
const withoutHashes = (source) =>
  Buffer.from(
    source.toString("latin1").replace(CHUNK_HASH, "########"),
    "latin1"
  );

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
const isRecord = (value) => typeof value === "object" && value !== null;

/**
 * The route table of a loaded manifest module: route id to its preloaded chunks.
 * @param {unknown} mod
 * @returns {Map<string, string[] | undefined>}
 */
function routesOf(mod) {
  const read = isRecord(mod) ? mod.tsrStartManifest : undefined;
  /** @type {unknown} */
  const table =
    typeof read === "function" ? Reflect.apply(read, undefined, []) : undefined;
  const routes = isRecord(table) ? table.routes : undefined;
  if (!isRecord(routes)) {
    throw new Error(
      "manifest module does not export tsrStartManifest().routes: unexpected build"
    );
  }
  /** @type {Map<string, string[] | undefined>} */
  const out = new Map();
  for (const [id, route] of Object.entries(routes)) {
    const preloads = isRecord(route) ? route.preloads : undefined;
    out.set(
      id,
      Array.isArray(preloads)
        ? preloads.filter((p) => typeof p === "string")
        : undefined
    );
  }
  return out;
}

/**
 * Per-route gzip sizes of the build at `dist`.
 * @param {string} dist
 * @returns {Promise<{ entry: number, shell: number, routes: Record<string, number>, total: number }>}
 */
export async function measure(dist) {
  const serverAssets = path.join(dist, "server/assets");
  const client = path.join(dist, "client");
  let manifestFile;
  try {
    manifestFile = readdirSync(serverAssets).find((f) =>
      f.startsWith("_tanstack-start-manifest")
    );
  } catch {
    manifestFile = undefined;
  }
  if (manifestFile === undefined) {
    throw new Error(
      `no production web build at ${dist} (expected ${serverAssets}/_tanstack-start-manifest*.js): run \`pnpm build\` first`
    );
  }
  /** @type {unknown} */
  const loaded = await import(
    pathToFileURL(path.join(serverAssets, manifestFile)).href
  );
  const manifest = routesOf(loaded);
  const rootPreloads = manifest.get(ROOT_ROUTE);
  if (rootPreloads === undefined) {
    throw new Error(`manifest has no ${ROOT_ROUTE} preloads: unexpected build`);
  }

  /** @type {Map<string, number>} */
  const gzips = new Map();
  /** @type {Map<string, string[]>} */
  const imports = new Map();
  /** @param {string} chunk `/assets/x.js` */
  const read = (chunk) => readFileSync(path.join(client, chunk));
  /** @param {string} chunk */
  const gz = (chunk) => {
    let size = gzips.get(chunk);
    if (size === undefined) {
      size = gzipSync(withoutHashes(read(chunk))).length;
      gzips.set(chunk, size);
    }
    return size;
  };
  /** @param {string} chunk */
  const staticImports = (chunk) => {
    let deps = imports.get(chunk);
    if (deps === undefined) {
      const source = read(chunk).toString("utf-8");
      deps = [
        ...new Set(
          [...source.matchAll(STATIC_IMPORT)].map(
            (m) => `/assets/${m[1].slice(2)}`
          )
        ),
      ];
      imports.set(chunk, deps);
    }
    return deps;
  };
  /** @param {readonly string[]} preloads */
  const closure = (preloads) => {
    /** @type {Set<string>} */
    const seen = new Set();
    const stack = [...preloads];
    while (stack.length > 0) {
      const chunk = stack.pop();
      if (chunk === undefined || seen.has(chunk)) continue;
      seen.add(chunk);
      stack.push(...staticImports(chunk));
    }
    return seen;
  };
  /** @param {Iterable<string>} chunks */
  const sum = (chunks) => {
    let bytes = 0;
    for (const chunk of chunks) bytes += gz(chunk);
    return bytes;
  };

  const rootSet = closure(rootPreloads);
  const shellSet = new Set([
    ...rootSet,
    ...closure(manifest.get(SHELL_ROUTE) ?? []),
  ]);

  /** @type {Record<string, number>} */
  const routes = {};
  for (const [id, preloads] of manifest) {
    if (id === ROOT_ROUTE || id === SHELL_ROUTE || preloads === undefined) {
      continue;
    }
    routes[id] = sum(
      [...closure(preloads)].filter((chunk) => !shellSet.has(chunk))
    );
  }

  const total = sum(
    readdirSync(path.join(client, "assets"))
      .filter((f) => f.endsWith(".js"))
      .map((f) => `/assets/${f}`)
  );
  return { entry: sum(rootSet), shell: sum(shellSet), routes, total };
}

/**
 * @typedef {{ entry: number, shell: number, routes: Record<string, number> }} Budget
 */

/** Largest value a metric may take against its baseline. */
/** @param {number} baseline */
const ceiling = (baseline) => Math.floor(baseline * (1 + TOLERANCE));

/**
 * @param {Budget & { total: number }} measured
 * @param {{ entry?: number, shell?: number, routes: Record<string, number> }} baseline
 * @returns {{ failures: string[], added: string[], shrunk: string[], stale: string[], next: Budget }}
 */
export function compare(measured, baseline) {
  /** @type {string[]} */
  const failures = [];
  /** @type {string[]} */
  const shrunk = [];
  /** @type {string[]} */
  const stale = [];
  /** @type {string[]} */
  const added = [];
  /**
   * @param {string} name
   * @param {number} now
   * @param {number | undefined} base
   */
  const keep = (name, now, base) => {
    if (base === undefined) return now;
    if (now > ceiling(base)) {
      const pct = (((now - base) / base) * 100).toFixed(1);
      failures.push(
        `${name}: ${kb(now)} gzip, baseline ${kb(base)} (+${pct}%, limit +${TOLERANCE * 100}%)`
      );
    } else if (now < base) {
      shrunk.push(name);
    }
    return Math.min(now, base);
  };

  const next = {
    entry: keep("entry (__root__ closure)", measured.entry, baseline.entry),
    shell: keep(
      "signed-in shell (root + /_protected)",
      measured.shell,
      baseline.shell
    ),
    /** @type {Record<string, number>} */
    routes: {},
  };
  for (const [id, size] of Object.entries(measured.routes)) {
    if (baseline.routes[id] === undefined) {
      added.push(id);
    }
    next.routes[id] = keep(`route ${id}`, size, baseline.routes[id]);
  }
  for (const id of Object.keys(baseline.routes)) {
    if (measured.routes[id] === undefined) stale.push(id);
  }
  return { failures, added, shrunk, stale, next };
}

/** @param {number} bytes */
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/**
 * @param {string} file
 * @returns {Budget | null}
 */
function readBaseline(file) {
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
  if (!isRecord(raw) || !isRecord(raw.routes)) return null;
  const { entry, shell } = raw;
  if (typeof entry !== "number" || typeof shell !== "number") return null;
  /** @type {Record<string, number>} */
  const routes = {};
  for (const [id, size] of Object.entries(raw.routes)) {
    if (typeof size === "number") routes[id] = size;
  }
  return { entry, shell, routes };
}

/** @param {string[]} argv @param {string} flag */
const option = (argv, flag) => {
  const at = argv.indexOf(flag);
  return at === -1 ? undefined : argv[at + 1];
};

async function main() {
  const argv = process.argv.slice(2);
  const dist = path.resolve(
    option(argv, "--dist") ?? path.join(root, "apps/web/dist")
  );
  const baselinePath = path.resolve(
    option(argv, "--baseline") ??
      path.join(root, "scripts/bundle-budget-baseline.json")
  );
  const update = argv.includes("--update");

  let measured;
  try {
    measured = await measure(dist);
  } catch (error) {
    console.error(
      `✗ check:bundle: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  }

  if (argv.includes("--json")) {
    console.log(JSON.stringify(measured, null, 2));
    return;
  }

  const existing = readBaseline(baselinePath);
  if (existing === null && !update) {
    console.error(
      `✗ check:bundle: no readable baseline at ${path.relative(root, baselinePath)}: run \`pnpm build && pnpm check:bundle --update\``
    );
    process.exit(1);
  }
  const { failures, added, shrunk, stale, next } = compare(
    measured,
    existing ?? { routes: {} }
  );

  console.log(
    `check:bundle: entry ${kb(measured.entry)}, shell ${kb(measured.shell)}, ${Object.keys(measured.routes).length} routes (gzip); total client JS ${kb(measured.total)} (reported, not gated)`
  );

  if (update) {
    /** @type {Record<string, number>} */
    const routes = {};
    for (const id of Object.keys(next.routes).sort((a, b) =>
      a.localeCompare(b)
    )) {
      routes[id] = next.routes[id];
    }
    writeFileSync(
      baselinePath,
      `${JSON.stringify({ entry: next.entry, shell: next.shell, routes }, null, 2)}\n`
    );
    console.log(
      `check:bundle: baseline written (${shrunk.length} shrunk, ${added.length} added, ${stale.length} removed)`
    );
    // Growth is not baselined: a number never goes up here.
    for (const f of failures) console.error(`✗ ${f}`);
    if (failures.length > 0) process.exit(1);
    return;
  }

  if (existing !== null) {
    for (const id of added) {
      failures.push(
        `route ${id}: ${kb(measured.routes[id])} gzip is not in the baseline (new route): run \`pnpm build && pnpm check:bundle --update\` to add it`
      );
    }
  }

  if (failures.length > 0) {
    for (const f of failures) console.error(`✗ ${f}`);
    console.error(
      `\ncheck:bundle: a route downloads more JavaScript than its baseline allows. Shrink it (lazy-load the dependency, check \`dist/client/assets\`), or, if the growth is deliberate, raise the number by hand in scripts/bundle-budget-baseline.json and say why in the PR ("pnpm check:bundle --update" only ever lowers a number). See docs/contributing/ci-gates.md#bundle-budget.`
    );
    process.exit(1);
  }
  if (shrunk.length > 0 || stale.length > 0) {
    console.log(
      `check:bundle: ok. ${shrunk.length} metric(s) shrank and ${stale.length} baseline route(s) are gone: run \`pnpm build && pnpm check:bundle --update\` and commit the baseline to lock the gain in.`
    );
    return;
  }
  console.log("check:bundle: ok");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
