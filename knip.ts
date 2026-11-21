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
    "apps/web/ui/src/**": ["exports", "types"],
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
    "apps/web/src/domains/entities/components/case-graph/case-graph-ranks.ts": [
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
        // Vendored shadcn primitives: the whole set is kept in sync, used or not.
        "ui/src/components/*.tsx",
        "ui/src/hooks/*.ts",
        "scripts/**/*.{mjs,ts,js}",
        "src/**/__tests__/**/*.{test.ts,component.test.tsx}",
        "src/test-setup.ts",
      ],
      project: [
        "src/**/*.{ts,tsx}",
        "ui/src/**/*.{ts,tsx}",
        "scripts/**/*.{mjs,ts,js}",
      ],
      ignoreFiles: [
        "src/shared/layout/section-label.tsx",
        // Read by path in react-compiler-coverage.test.ts, never imported.
        "src/build/__tests__/fixtures/**",
      ],
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
    "apps/cli": {
      entry: [
        "src/main.ts",
        "scripts/build.mjs",
        "scripts/pack-smoke.mjs",
        "src/**/__tests__/**/*.test.ts",
        "src/commands/__tests__/**/*.test.ts",
        "client/src/index.ts",
        "client/src/**/__tests__/**/*.test.ts",
      ],
      project: [
        "src/**/*.ts",
        "scripts/**/*.{ts,mjs}",
        "client/src/**/*.ts",
        "!client/src/generated/**",
      ],
    },
    "packages/caps": {
      entry: [
        "src/**/__tests__/**/*.test.ts",
        "ai/src/index.ts",
        "ai/src/**/__tests__/**/*.test.ts",
        "tools/src/**/__tests__/**/*.test.ts",
      ],
      project: ["src/**/*.ts", "ai/src/**/*.ts", "tools/src/**/*.ts"],
    },
    "packages/domain": {
      entry: [
        "policy/src/**/__tests__/**/*.test.ts",
        "schemas/src/**/__tests__/**/*.test.ts",
        "test-kit/src/index.ts",
        "test-kit/src/fc.ts",
        "test-kit/src/fixtures.ts",
        "test-kit/src/http/msw-setup.ts",
        "test-kit/src/http/mock-server.ts",
      ],
      project: [
        "policy/src/**/*.ts",
        "schemas/src/**/*.ts",
        "test-kit/src/**/*.ts",
      ],
    },
    "packages/server": {
      entry: [
        "api/src/index.ts",
        "api/scripts/**/*.ts",
        "api/src/**/__tests__/**/*.ts",
        "auth/src/server.ts",
        "auth/src/instance-admin.ts",
        "auth/src/org-roles.ts",
        "auth/src/invitation-url.ts",
        "auth/src/bootstrap-admin-cli.ts",
        "auth/src/**/__tests__/**/*.test.ts",
        "core/src/vault-rekey-cli.ts",
        "core/src/**/__tests__/**/*.test.ts",
        // The container's migrator: db/src/migrate-cli.ts (bundled by build-migrate.mjs).
        "db/src/index.ts",
        "db/src/migrate-cli.ts",
        "db/scripts/build-migrate.mjs",
        "db/src/**/__tests__/**/*.ts",
        "log/src/index.ts",
        "log/src/**/__tests__/**/*.test.ts",
        "test-db/src/index.ts",
        "test-db/src/**/__tests__/**/*.test.ts",
        "worker/src/main.ts",
        "worker/scripts/build.mjs",
        "worker/src/**/__tests__/**/*.test.ts",
      ],
      project: [
        "*/src/**/*.ts",
        "api/scripts/**/*.ts",
        "db/scripts/build-migrate.mjs",
        "worker/scripts/**/*.mjs",
      ],
    },
  },
};

export default config;
