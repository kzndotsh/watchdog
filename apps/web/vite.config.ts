import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { createSourceLocationPlugin, createStripPlugin } from "evlog/vite";
import { defineConfig } from "vite";

const srcRoot = path.join(import.meta.dirname, "src");

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
    createStripPlugin(["debug"]),
    createSourceLocationPlugin(),
  ],
  ssr: {
    // Workspace packages ship TS source
    noExternal: [
      "@watchdog/ai",
      "@watchdog/api",
      "@watchdog/cap-sdk",
      "@watchdog/caps",
      "@watchdog/core",
      "@watchdog/db",
      "@watchdog/env",
      "@watchdog/log",
      "@watchdog/policy",
      "@watchdog/schemas",
      "@watchdog/tools",
    ],
  },
  // Belt for residual HMR / server-fn discovery after client code stays on
  // `@watchdog/policy/patch-needs-confidence` (do not import Effect in browser UI).
  optimizeDeps: {
    include: ["effect"],
  },
});

export default config;
