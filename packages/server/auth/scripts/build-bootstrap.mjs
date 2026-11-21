#!/usr/bin/env node
/**
 * Bundle `src/bootstrap-admin-cli.ts` to one ESM `dist/bootstrap-admin.mjs` (Better Auth's hash,
 * drizzle-orm and postgres inlined), which the web image carries next to `serve.mjs` so the
 * first admin can be created inside the container (`node bootstrap-admin.mjs`). A failed build
 * rejects, so the script exits non-zero.
 */
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/bootstrap-admin-cli.ts"],
  outfile: "dist/bootstrap-admin.mjs",
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
