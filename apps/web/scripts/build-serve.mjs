#!/usr/bin/env node
/**
 * Bundle the production server and the SSR build into one ESM file, `dist/serve.mjs` (run
 * `WD_BUNDLE_SSR=1 pnpm build` first so `dist/server` has no external imports). The container
 * image ships this file and `dist/client`, with no node_modules. A failed build rejects, so the
 * script exits non-zero.
 */
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["scripts/serve.mjs"],
  outfile: "dist/serve.mjs",
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
