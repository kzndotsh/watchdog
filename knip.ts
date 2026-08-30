import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreExportsUsedInFile: {
    interface: true,
    type: true,
    function: true,
  },
  ignoreBinaries: ["check", "desloppify"],
  ignore: ["_legacy-v1/**", "_legacy-v2/**"],
  ignoreIssues: {
    "apps/web/src/domains/**/types.ts": ["types"],
    "apps/web/src/domains/**/*.server.ts": ["types"],
    "apps/web/src/auth/server.ts": ["types"],
    // WD UI + domain helpers exported for /ui gallery, COMPONENTS.md, and tests.
    "apps/web/src/shared/ui/skeletons.tsx": ["exports"],
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
      ignore: ["src/shared/ui/shadcn/**"],
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
      entry: ["src/main.ts", "src/**/__tests__/**/*.test.ts"],
      project: ["src/**/*.ts"],
    },
    "packages/ai": {
      entry: ["src/index.ts", "src/**/__tests__/**/*.test.ts"],
      project: ["src/**/*.ts"],
    },
    "packages/api": {
      entry: ["src/index.ts", "scripts/**/*.ts", "src/**/__tests__/**/*.ts"],
      project: ["src/**/*.ts", "scripts/**/*.ts"],
    },
    "packages/cap-sdk": {
      entry: ["src/index.ts", "src/**/__tests__/**/*.test.ts"],
      project: ["src/**/*.ts"],
    },
    "packages/caps": {
      entry: ["src/**/__tests__/**/*.test.ts"],
      project: ["src/**/*.ts"],
    },
    "packages/cli": {
      entry: ["src/main.ts", "src/**/__tests__/**/*.test.ts"],
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
      entry: ["src/index.ts", "src/**/__tests__/**/*.ts"],
      project: ["src/**/*.ts"],
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
    "packages/test-kit": {
      entry: [
        "src/index.ts",
        "src/fc.ts",
        "src/fixtures.ts",
        "src/db.ts",
        "src/http/msw-setup.ts",
        "src/http/mock-server.ts",
        "src/it/index.ts",
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
