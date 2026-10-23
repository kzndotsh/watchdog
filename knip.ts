import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreExportsUsedInFile: {
    interface: true,
    type: true,
    function: true,
  },
  // psql: the migration test runs the perf seed with it (the CI integration job installs it).
  ignoreBinaries: ["check", "desloppify", "openssl", "psql"],
  // _legacy-v2: local frozen tree, untracked (AGENTS.md); keep knip out of it when present.
  ignore: ["_legacy-v2/**", ".claude/worktrees/**"],
  ignoreIssues: {
    // Vendored shadcn output: unused *files* still surface; unused exports are upstream's.
    "packages/ui/src/**": ["exports", "types"],
    "apps/web/src/shared/ui/primitives/**": ["exports", "types"],
    "apps/web/src/domains/**/types.ts": ["types"],
    "apps/web/src/domains/**/*.server.ts": ["types"],
    "apps/web/src/auth/server.ts": ["types"],
    // WD UI + domain helpers exported for /ui gallery, COMPONENTS.md, and tests.
    "apps/web/src/shared/ui/active-tab-body.tsx": ["exports"],
    "apps/web/src/shared/ui/graph/index.ts": ["exports"],
    "apps/web/src/shared/ui/graph/graph-bezier.ts": ["exports"],
    "apps/web/src/shared/ui/graph/graph-canvas-background.tsx": ["exports"],
    "apps/web/src/shared/ui/graph/graph-canvas-skeleton.tsx": ["exports"],
    "apps/web/src/shared/ui/graph/types.ts": ["types"],
    "apps/web/src/shared/ui/vocab/index.ts": ["exports"],
    "apps/web/src/shared/ui/vocab/status.lib.ts": ["exports"],
    "apps/web/src/domains/cases/components/case-graph/case-graph-ranks.ts": [
      "exports",
    ],
    "apps/web/src/domains/jobs/lib/playbook-match.ts": ["exports"],
    "apps/web/src/domains/jobs/lib/playbook-select-group.ts": ["exports"],
    "apps/web/src/domains/jobs/lib/status.ts": ["exports"],
  },
  workspaces: {
    ".": {
      entry: [
        "vitest.config.ts",
        "playwright.config.ts",
        "e2e/**/*.ts",
        "scripts/**/*.{mjs,js,ts}",
      ],
      project: [
        "vitest.config.ts",
        "playwright.config.ts",
        "e2e/**/*.ts",
        "scripts/**/*.{mjs,js,ts}",
      ],
      // Root depends on @watchdog/cli so `pnpm exec wd` / node_modules/.bin/wd work.
      // `cn` is resolved by @shadcn/lint at lint time (grammar >= 0.3.2); nothing imports it.
      // `undici` is mocked by name in scripts/vitest/undici-fetch-seam.ts (resolved from the root).
      ignoreDependencies: ["@watchdog/cli", "cn", "undici"],
    },
    "apps/site": {
      entry: ["src/pages/**/*.{astro,ts}", "astro.config.mjs"],
      project: ["src/**/*.{astro,ts}", "astro.config.mjs"],
      ignoreDependencies: [
        "@fontsource-variable/geist",
        "@fontsource-variable/geist-mono",
        "tailwindcss",
      ],
    },
    "apps/web": {
      entry: [
        "src/router.tsx",
        "src/routes/**/*.{ts,tsx}",
        "scripts/**/*.{mjs,ts,js}",
        "src/**/__tests__/**/*.{test.ts,component.test.tsx}",
        "src/test-setup.ts",
      ],
      project: ["src/**/*.{ts,tsx}", "scripts/**/*.{mjs,ts,js}"],
      ignoreFiles: ["src/shared/layout/section-label.tsx"],
      ignoreDependencies: [
        "@fontsource-variable/geist",
        "@fontsource-variable/geist-mono",
        "@tailwindcss/typography",
        "cmdk",
        "shadcn",
        "tw-animate-css",
        // Playwright runs from repo root (`playwright.config.ts`, `e2e/`).
        "playwright",
      ],
    },
    "apps/worker": {
      entry: [
        "src/main.ts",
        "scripts/build.mjs",
        "src/**/__tests__/**/*.test.ts",
      ],
      project: ["src/**/*.ts", "scripts/**/*.mjs"],
    },
    "apps/cli": {
      entry: [
        "src/main.ts",
        "scripts/build.mjs",
        "scripts/pack-smoke.mjs",
        "src/**/__tests__/**/*.test.ts",
        "src/commands/__tests__/**/*.test.ts",
      ],
      project: ["src/**/*.ts", "scripts/**/*.{ts,mjs}"],
    },
    "packages/ai": {
      entry: ["src/index.ts", "src/**/__tests__/**/*.test.ts"],
      project: ["src/**/*.ts"],
    },
    "packages/api": {
      entry: ["src/index.ts", "scripts/**/*.ts", "src/**/__tests__/**/*.ts"],
      project: ["src/**/*.ts", "scripts/**/*.ts"],
    },
    "packages/auth": {
      entry: [
        "src/server.ts",
        "src/instance-admin.ts",
        "src/org-roles.ts",
        "src/invitation-url.ts",
        "src/**/__tests__/**/*.test.ts",
      ],
      project: ["src/**/*.ts"],
    },
    "packages/caps": {
      entry: ["src/**/__tests__/**/*.test.ts"],
      project: ["src/**/*.ts"],
    },
    "packages/client": {
      entry: ["src/index.ts"],
      project: ["src/**/*.ts", "!src/generated/**"],
    },
    "packages/core": {
      entry: ["src/**/__tests__/**/*.test.ts"],
      project: ["src/**/*.ts"],
    },
    "packages/db": {
      // The container's migrator: src/migrate-cli.ts (bundled by build-migrate.mjs).
      entry: [
        "src/index.ts",
        "src/migrate-cli.ts",
        "scripts/build-migrate.mjs",
        "src/**/__tests__/**/*.ts",
      ],
      project: [
        "src/**/*.ts",
        "src/migrate-cli.ts",
        "scripts/build-migrate.mjs",
      ],
    },
    "packages/policy": {
      entry: ["src/**/__tests__/**/*.test.ts"],
      project: ["src/**/*.ts"],
    },
    "packages/schemas": {
      entry: ["src/**/__tests__/**/*.test.ts"],
      project: ["src/**/*.ts"],
    },
    "packages/log": {
      entry: ["src/index.ts", "src/**/__tests__/**/*.test.ts"],
      project: ["src/**/*.ts"],
    },
    "packages/test-db": {
      entry: ["src/index.ts", "src/**/__tests__/**/*.test.ts"],
      project: ["src/**/*.ts"],
    },
    "packages/test-kit": {
      entry: [
        "src/index.ts",
        "src/fc.ts",
        "src/fixtures.ts",
        "src/http/msw-setup.ts",
        "src/http/mock-server.ts",
      ],
      project: ["src/**/*.ts"],
    },
    "packages/tools": {
      entry: ["src/**/__tests__/**/*.test.ts"],
      project: ["src/**/*.ts"],
    },
  },
};

export default config;
