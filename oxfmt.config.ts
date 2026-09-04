import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

const watchdogIgnores = [
  "_legacy-v1/**",
  "_legacy-v2/**",
  ".direnv/**",
  "graph/**",
  "data/**",
  "staging/**",
  "export/**",
  "reports/**",
  "templates/**",
  "**/routeTree.gen.ts",
  "packages/client/src/generated/**",
  "packages/caps/capabilities.gen.json",
  "packages/db/drizzle/**",
  "**/dist/**",
  "node_modules/**",
  "pnpm-lock.yaml",
  // Better Auth UI + shadcn registry — do not reformat
  "apps/web/src/auth/ui/**",
  "apps/web/src/shared/ui/shadcn/**",
  ".cursor/**",
  ".agents/**",
  ".claude/**",
  ".kiro/**",
  "skills/**",
  "repos/**",
];

export default defineConfig({
  ...ultracite,
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), ...watchdogIgnores],
  sortImports: {
    ...(typeof ultracite.sortImports === "object" ? ultracite.sortImports : {}),
    ignoreCase: true,
    internalPattern: ["@/", "@watchdog/", "#/"],
    newlinesBetween: true,
    order: "asc",
  },
  sortPackageJson: true,
  sortTailwindcss: {
    functions: ["cn", "cva", "clsx"],
  },
});
