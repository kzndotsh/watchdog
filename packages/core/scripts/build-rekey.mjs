#!/usr/bin/env node
/**
 * Bundle `src/vault-rekey-cli.ts` to one ESM `dist/vault-rekey.mjs` (drizzle-orm and postgres
 * inlined), which the web image carries next to `serve.mjs` so the vault master key can be
 * rotated inside the container (`node vault-rekey.mjs`). A failed build rejects, so the script
 * exits non-zero.
 */
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/vault-rekey-cli.ts"],
  outfile: "dist/vault-rekey.mjs",
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
