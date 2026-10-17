#!/usr/bin/env node
/**
 * Bundle `src/migrate-cli.ts` to one ESM `dist/migrate.mjs` (drizzle-orm and postgres inlined),
 * which the container entrypoint runs next to a copy of `drizzle/`. No drizzle-kit at runtime.
 * A failed build rejects, so the script exits non-zero.
 */
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/migrate-cli.ts"],
  outfile: "dist/migrate.mjs",
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
