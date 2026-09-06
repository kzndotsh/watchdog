#!/usr/bin/env node
/**
 * Build `wd` to a single ESM `dist/main.js` (workspace packages inlined).
 * Same artifact for in-repo PATH and `npm pack`.
 */
import { chmodSync } from "node:fs";

import * as esbuild from "esbuild";

const result = await esbuild.build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // CJS deps (dotenv) call require(); ESM bundle needs createRequire.
  banner: {
    js: `#!/usr/bin/env node
import { createRequire as __wdCreateRequire } from "node:module";
const require = __wdCreateRequire(import.meta.url);`,
  },
  logLevel: "info",
});

if (result.errors.length > 0) {
  process.exit(1);
}

chmodSync("dist/main.js", 0o755);
