/**
 * Build step: write a brotli (`.br`) and a gzip (`.gz`) sibling next to every compressible file
 * in the client build, so the production server (`src/lib/static-assets.server.ts`) answers with
 * the smallest bytes at no CPU cost. Max-effort compression is affordable because it runs once
 * per build. A sibling is written only when it is smaller than the original.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";

import type { Plugin } from "vite";

const brotli = promisify(brotliCompress);
const gz = promisify(gzip);

/** The types srvx's `staticMiddleware` treats as compressible (the only ones it looks up). */
const COMPRESSIBLE = new Set([
  ".html",
  ".htm",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".txt",
  ".xml",
  ".svg",
  ".wasm",
]);

/** Below this a file is not worth a sibling (srvx does not compress under 1 KiB either). */
const MIN_BYTES = 1024;

export type PrecompressStats = {
  files: number;
  bytes: number;
  brotli: number;
  gzip: number;
};

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

/** Write `.br` and `.gz` siblings for the compressible files under `dir`. */
export async function precompressDir(dir: string): Promise<PrecompressStats> {
  const stats: PrecompressStats = { files: 0, bytes: 0, brotli: 0, gzip: 0 };
  for await (const file of walk(dir)) {
    if (!COMPRESSIBLE.has(path.extname(file))) continue;
    const source = await readFile(file);
    if (source.length < MIN_BYTES) continue;
    const [br, gzipped] = await Promise.all([
      brotli(source, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
          [constants.BROTLI_PARAM_SIZE_HINT]: source.length,
        },
      }),
      gz(source, { level: 9 }),
    ]);
    stats.files += 1;
    stats.bytes += source.length;
    stats.brotli += Math.min(br.length, source.length);
    stats.gzip += Math.min(gzipped.length, source.length);
    if (br.length < source.length) await writeFile(`${file}.br`, br);
    if (gzipped.length < source.length) await writeFile(`${file}.gz`, gzipped);
  }
  return stats;
}

/** Vite plugin: precompress the client build's output directory once it is written. */
export function precompressPlugin(): Plugin {
  return {
    name: "watchdog:precompress",
    apply: "build",
    applyToEnvironment: (environment) => environment.name === "client",
    async writeBundle(options) {
      if (options.dir === undefined) return;
      const stats = await precompressDir(options.dir);
      const kib = (n: number) => `${(n / 1024).toFixed(1)} KiB`;
      this.info(
        `precompressed ${stats.files} files: ${kib(stats.bytes)} -> brotli ${kib(stats.brotli)}, gzip ${kib(stats.gzip)}`
      );
    },
  };
}
