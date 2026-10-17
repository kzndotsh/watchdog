#!/usr/bin/env node
/**
 * Bundle the worker to one ESM `dist/worker.mjs` (workspace packages and npm dependencies
 * inlined) so the container image needs no node_modules and no TypeScript loader at runtime.
 * `pnpm dev:worker` still runs the source through tsx. A failed build rejects, so the script
 * exits non-zero.
 */
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/worker.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // CJS dependencies call require(); an ESM bundle needs createRequire.
  banner: {
    js: `import { createRequire as __wdCreateRequire } from "node:module";
const require = __wdCreateRequire(import.meta.url);`,
  },
  logLevel: "info",
});
