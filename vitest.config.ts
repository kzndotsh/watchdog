import path from "node:path";

import babel from "@rolldown/plugin-babel";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { reactCompilerBabelPreset } from "./apps/web/react-compiler.ts";

const webSrc = path.join(import.meta.dirname, "apps/web/src");

/** Registers the shared `@/auth/server` double for every web test (docs/contributing/testing/standards.md Mock policy). */
const webAuthServerDouble = "apps/web/src/testing/mock-auth-server.setup.ts";

/** Web tests that need a DOM (RTL hooks or browser globals) — excluded from web-unit. */
const webDomTestGlobs = [
  "apps/web/src/**/hooks/**/__tests__/**/*.test.ts",
  "apps/web/src/shared/lib/__tests__/display-scale.test.ts",
  "apps/web/src/shared/lib/__tests__/display-scale-store.test.ts",
  "apps/web/src/shared/lib/__tests__/use-global-hotkeys.test.ts",
  "apps/web/src/shared/lib/__tests__/hotkeys.test.ts",
  "apps/web/src/shared/lib/__tests__/query-client.test.ts",
  "apps/web/src/shared/lib/__tests__/query-invalidation.test.ts",
  "apps/web/src/shared/lib/__tests__/query-enabled.test.ts",
  "apps/web/src/shared/layout/__tests__/use-page-trail.test.ts",
  "apps/web/src/shared/hooks/**/__tests__/**/*.test.ts",
  "apps/web/src/shared/ui/data-table/__tests__/use-data-table.test.ts",
  "apps/web/src/domains/cases/lib/__tests__/active-case.test.ts",
] as const;

const unitExclude = [
  "**/node_modules/**",
  "**/dist/**",
  "**/*.int.test.ts",
  "**/*.property.test.ts",
  "**/*.component.test.tsx",
  "apps/web/src/**/__tests__/**/*.test.ts",
  "e2e/**",
];

/** Per-file setup of the shared-worker projects; the canary goes last, after any other global setup. */
const sharedWorkerSetup = [
  "scripts/vitest/reset-modules.ts",
  "scripts/vitest/undici-fetch-seam.ts",
  "scripts/vitest/leak-canary.ts",
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
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://127.0.0.1:9100",
  S3_ACCESS_KEY: process.env.S3_ACCESS_KEY ?? "watchdog",
  S3_SECRET_KEY: process.env.S3_SECRET_KEY ?? "watchdog-dev-secret",
  S3_BUCKET: "watchdog-evidence",
  S3_REGION: "us-east-1",
  WD_MASTER_VAULT_KEY: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
} as const;

/*
 * Speed: projects run with `isolate: false` plus `scripts/vitest/reset-modules.ts`.
 * A fresh worker per file re-evaluated effect / drizzle / postgres for each of ~1,000
 * files (import was ~75% of run time). Without isolation, externals load once per worker,
 * while the setup file clears the module registry before every file so `vi.mock` still
 * applies to our own modules. The catch: process-wide state (process.env, globalThis,
 * fake timers, DOM) is shared between files in a worker, so tests must restore what they change.
 * `unstubGlobals` / `unstubEnvs` undo `vi.stubGlobal` / `vi.stubEnv` after every test: a leaked
 * `fetch` stub made unrelated suites (msw-backed cap runs, certspotter, ...) fail depending on
 * which files shared a worker.
 * `scripts/vitest/leak-canary.ts` (last setup file of every shared-worker project) fails the file that
 * leaves a global, spy, `process.env` key or fake timer changed, so a leak is blamed on its
 * author instead of on whichever file runs next.
 */
export default defineConfig({
  test: {
    // Mock history is cleared before every test in each project below that sets
    // `clearMocks: true` (every project the nightly shuffle runs): without it call counts
    // accumulate across tests, repeats and shuffled orders ("called 1 times, got 3").
    // A suite that asserts calls made at import time or in beforeAll must re-run that
    // import per test (`vi.resetModules()` + dynamic `import()`) or snapshot the calls
    // in its own beforeAll. Integration keeps the old default until its suites are
    // checked against a database.
    clearMocks: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      exclude: [
        "**/__tests__/**",
        "e2e/**",
        "**/*.gen.ts",
        "**/generated/**",
        "**/drizzle/**",
        "packages/client/src/generated/**",
        // Vendored shadcn primitives (ui:sync): codecov.yml ignores them too.
        "packages/ui/src/components/**",
        "packages/ui/src/hooks/**",
      ],
    },
    projects: [
      {
        test: {
          name: "e2e-parser",
          clearMocks: true,
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
          clearMocks: true,
          include: [
            "packages/*/src/**/__tests__/**/*.test.ts",
            "packages/*/scripts/**/__tests__/**/*.test.ts",
            "apps/worker/src/**/__tests__/**/*.test.ts",
            "apps/cli/src/**/__tests__/**/*.test.ts",
            "apps/cli/src/commands/__tests__/**/*.test.ts",
          ],
          exclude: unitExclude,
          environment: "node",
          isolate: false,
          unstubGlobals: true,
          unstubEnvs: true,
          setupFiles: sharedWorkerSetup,
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
          clearMocks: true,
          include: ["apps/web/src/**/__tests__/**/*.test.ts"],
          exclude: [
            "**/node_modules/**",
            "**/*.int.test.ts",
            ...webDomTestGlobs,
          ],
          environment: "node",
          isolate: false,
          unstubGlobals: true,
          unstubEnvs: true,
          setupFiles: [
            "scripts/vitest/reset-modules.ts",
            webAuthServerDouble,
            "scripts/vitest/leak-canary.ts",
          ],
          env: webTestEnv,
        },
      },
      {
        test: {
          name: "property",
          clearMocks: true,
          include: [
            "packages/*/src/**/__tests__/**/*.property.test.ts",
            "apps/*/src/**/__tests__/**/*.property.test.ts",
          ],
          exclude: ["**/node_modules/**"],
          environment: "node",
          isolate: false,
          unstubGlobals: true,
          unstubEnvs: true,
          setupFiles: sharedWorkerSetup,
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
          clearMocks: true,
          include: [
            "apps/web/src/**/__tests__/**/*.component.test.tsx",
            ...webDomTestGlobs,
          ],
          environment: "happy-dom",
          pool: "threads",
          isolate: false,
          unstubGlobals: true,
          unstubEnvs: true,
          setupFiles: [
            "scripts/vitest/reset-modules.ts",
            webAuthServerDouble,
            "apps/web/src/test-setup.ts",
            "scripts/vitest/leak-canary.ts",
          ],
          deps: {
            optimizer: {
              client: {
                enabled: true,
              },
            },
          },
          env: webTestEnv,
        },
      },
      {
        // The web app ships with React Compiler (`apps/web/vite.config.ts`, mode `infer`); the
        // `component` project does not run it. A render bug that only exists once a component is
        // memoized (a stale cell, a skipped re-render) is tested here, in `*.compiled.test.tsx`.
        plugins: [
          react(),
          babel({
            presets: [reactCompilerBabelPreset("infer")],
          }),
        ],
        resolve: {
          alias: {
            "@": webSrc,
          },
        },
        test: {
          name: "component-compiled",
          clearMocks: true,
          include: ["apps/web/src/**/__tests__/**/*.compiled.test.tsx"],
          environment: "happy-dom",
          pool: "threads",
          isolate: false,
          unstubGlobals: true,
          unstubEnvs: true,
          setupFiles: [
            "scripts/vitest/reset-modules.ts",
            webAuthServerDouble,
            "apps/web/src/test-setup.ts",
            "scripts/vitest/leak-canary.ts",
          ],
          env: webTestEnv,
        },
      },
      {
        // Gate scripts run as CLIs against temporary git repos (scripts/__tests__/helpers).
        test: {
          name: "gate",
          clearMocks: true,
          include: ["scripts/__tests__/**/*.gate.test.ts"],
          environment: "node",
          isolate: false,
          unstubGlobals: true,
          unstubEnvs: true,
          setupFiles: sharedWorkerSetup,
          testTimeout: 30_000,
        },
      },
      {
        // `@` so web route-handler integration tests can import the routes.
        resolve: {
          alias: {
            "@": webSrc,
          },
        },
        test: {
          name: "integration",
          include: [
            "packages/*/src/**/__tests__/**/*.int.test.ts",
            "apps/*/src/**/__tests__/**/*.int.test.ts",
          ],
          exclude: ["**/node_modules/**"],
          environment: "node",
          fileParallelism: false,
          maxWorkers: 1,
          isolate: false,
          unstubGlobals: true,
          unstubEnvs: true,
          // Settle detached Export writes after each test, before the canary snapshot (#379).
          setupFiles: [
            ...sharedWorkerSetup.slice(0, -1),
            "scripts/vitest/settle-export-writes.ts",
            ...sharedWorkerSetup.slice(-1),
          ],
          env: integrationEnv,
        },
      },
    ],
  },
});
