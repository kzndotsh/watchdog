import path from "node:path";

import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { createSourceLocationPlugin, createStripPlugin } from "evlog/vite";
import { defineConfig } from "vite";

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
  ],
  ssr: {
    // Workspace packages ship TS source
    noExternal: [
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
  // Belt for residual HMR / server-fn discovery after client code stays on
  // `@watchdog/policy/patch-needs-confidence` (do not import Effect in browser UI).
  optimizeDeps: {
    include: ["effect"],
  },
});

export default config;
