import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const webSrc = path.join(import.meta.dirname, "apps/web/src");

/** Web tests that need a DOM (RTL hooks or browser globals) — excluded from web-unit. */
const webDomTestGlobs = [
  "apps/web/src/**/hooks/**/__tests__/**/*.test.ts",
  "apps/web/src/shared/lib/__tests__/use-global-hotkeys.test.ts",
  "apps/web/src/shared/lib/__tests__/hotkeys.test.ts",
  "apps/web/src/shared/lib/__tests__/query-client.test.ts",
  "apps/web/src/shared/lib/__tests__/query-invalidation.test.ts",
  "apps/web/src/shared/layout/__tests__/use-page-trail.test.ts",
  "apps/web/src/shared/hooks/**/__tests__/**/*.test.ts",
  "apps/web/src/shared/ui/data-table/__tests__/use-data-table.test.ts",
  "apps/web/src/domains/cases/lib/__tests__/active-case.test.ts",
] as const;

const unitExclude = [
  "**/node_modules/**",
  "**/dist/**",
  "_legacy-v1/**",
  "_legacy-v2/**",
  "**/*.int.test.ts",
  "**/*.property.test.ts",
  "**/*.component.test.tsx",
  "apps/web/src/**/__tests__/**/*.test.ts",
  "e2e/**",
];

const webTestEnv = {
  NODE_ENV: "test",
  SKIP_ENV_VALIDATION: "1",
} as const;

const integrationEnv = {
  NODE_ENV: "test",
  DATABASE_URL:
    "postgresql://watchdog_app:watchdog@127.0.0.1:5432/watchdog_test",
  DATABASE_URL_MIGRATE:
    "postgresql://postgres:postgres@127.0.0.1:5432/watchdog_test",
  BETTER_AUTH_SECRET: "test-secret-must-be-at-least-32-chars",
  BETTER_AUTH_URL: "http://127.0.0.1:3000",
  S3_ENDPOINT: "http://127.0.0.1:9100",
  S3_ACCESS_KEY: "minioadmin",
  S3_SECRET_KEY: "minioadmin",
  S3_BUCKET: "watchdog-evidence",
  S3_REGION: "us-east-1",
  WD_MASTER_VAULT_KEY: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
} as const;

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      exclude: [
        "**/__tests__/**",
        "e2e/**",
        "_legacy-*/**",
        "**/*.gen.ts",
        "**/generated/**",
        "**/drizzle/**",
        "packages/contract/src/generated/**",
      ],
    },
    projects: [
      {
        test: {
          name: "e2e-parser",
          include: ["e2e/**/*.test.ts"],
          environment: "node",
          env: {
            NODE_ENV: "test",
          },
        },
      },
      {
        test: {
          name: "unit",
          include: [
            "packages/*/src/**/__tests__/**/*.test.ts",
            "packages/*/scripts/**/__tests__/**/*.test.ts",
            "apps/worker/src/**/__tests__/**/*.test.ts",
            "apps/cli/src/**/__tests__/**/*.test.ts",
            "apps/cli/src/commands/__tests__/**/*.test.ts",
          ],
          exclude: unitExclude,
          environment: "node",
          env: webTestEnv,
        },
      },
      {
        plugins: [react()],
        resolve: {
          alias: {
            "@": webSrc,
          },
        },
        test: {
          name: "web-unit",
          include: ["apps/web/src/**/__tests__/**/*.test.ts"],
          exclude: [
            "**/node_modules/**",
            "_legacy-v1/**",
            "_legacy-v2/**",
            ...webDomTestGlobs,
          ],
          environment: "node",
          env: webTestEnv,
        },
      },
      {
        test: {
          name: "property",
          include: [
            "packages/*/src/**/__tests__/**/*.property.test.ts",
            "apps/*/src/**/__tests__/**/*.property.test.ts",
          ],
          exclude: ["**/node_modules/**", "_legacy-v1/**", "_legacy-v2/**"],
          environment: "node",
          env: webTestEnv,
        },
      },
      {
        plugins: [react()],
        resolve: {
          alias: {
            "@": webSrc,
          },
        },
        test: {
          name: "component",
          include: [
            "apps/web/src/**/__tests__/**/*.component.test.tsx",
            ...webDomTestGlobs,
          ],
          environment: "happy-dom",
          pool: "threads",
          setupFiles: ["apps/web/src/test-setup.ts"],
          deps: {
            optimizer: {
              web: {
                enabled: true,
              },
            },
          },
          env: webTestEnv,
        },
      },
      {
        test: {
          name: "integration",
          include: [
            "packages/*/src/**/__tests__/**/*.int.test.ts",
            "apps/*/src/**/__tests__/**/*.int.test.ts",
          ],
          exclude: ["**/node_modules/**", "_legacy-v1/**", "_legacy-v2/**"],
          environment: "node",
          fileParallelism: false,
          maxWorkers: 1,
          env: integrationEnv,
        },
      },
    ],
  },
});
