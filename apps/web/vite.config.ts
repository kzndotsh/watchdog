import path from "node:path";

import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { createSourceLocationPlugin, createStripPlugin } from "evlog/vite";
import { defineConfig } from "vite";

import { precompressPlugin } from "./src/build/precompress.ts";

const srcRoot = path.join(import.meta.dirname, "src");

/**
 * React Compiler trial (#48). `REACT_COMPILER=off` turns it off, `annotation` compiles only
 * functions marked "use memo", anything else (the default on this trial branch) is `infer`:
 * every client component and hook. The preset limits Babel to client files, so SSR skips it.
 */
const reactCompilerMode = process.env.REACT_COMPILER ?? "infer";

const config = defineConfig({
  // Monorepo: load `.env` from repo root (DATABASE_URL, BETTER_AUTH_*)
  envDir: "../../",
  resolve: {
    // Explicit alias: shadcn UI is tsconfig-excluded, so SSR tsconfigPaths
    // alone does not resolve `@/` imports from shared/ui.
    alias: {
      "@": srcRoot,
    },
    // Prefer .tsx over .ts so renamed JSX modules (vocab/*.tsx) don't keep
    // resolving to stale .ts URLs after a rename / HMR cycle.
    extensions: [".mjs", ".js", ".mts", ".tsx", ".ts", ".jsx", ".json"],
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    ...(reactCompilerMode === "off"
      ? []
      : [
          babel({
            presets: [
              reactCompilerPreset({
                compilationMode:
                  reactCompilerMode === "annotation" ? "annotation" : "infer",
              }),
            ],
          }),
        ]),
    createStripPlugin(["debug"]),
    createSourceLocationPlugin(),
    // brotli and gzip siblings of the client build, served by scripts/serve.mjs.
    precompressPlugin(),
  ],
  ssr: {
    // The container image sets WD_BUNDLE_SSR=1: every dependency is inlined into dist/server,
    // so the runtime image carries no node_modules. Otherwise only the workspace packages
    // (they ship TS source) are bundled.
    noExternal:
      process.env.WD_BUNDLE_SSR === "1"
        ? true
        : [
            "@watchdog/ai",
            "@watchdog/api",
            "@watchdog/auth",
            "@watchdog/caps",
            "@watchdog/core",
            "@watchdog/db",
            "@watchdog/env",
            "@watchdog/log",
            "@watchdog/policy",
            "@watchdog/schemas",
            "@watchdog/tools",
            "@watchdog/ui",
          ],
  },
  server: {
    // Dev only. Vite compiles each module the first time a page asks for it (through Babel, for
    // the React Compiler), so the first visit to a heavy page such as Collect waited on ~120
    // files. Warming the routes compiles them and their imports in the background at startup.
    warmup: {
      clientFiles: ["./src/routes/**/*.tsx"],
      ssrFiles: ["./src/routes/**/*.tsx"],
    },
  },
  // Belt for residual HMR / server-fn discovery after client code stays on
  // `@watchdog/policy/patch-needs-confidence` (do not import Effect in browser UI).
  optimizeDeps: {
    include: ["effect"],
  },
});

export default config;
