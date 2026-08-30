import process from "node:process";

import { defineConfig, devices } from "@playwright/test";

import { e2eEnv, e2eOrigin, e2eWebServerEnv } from "./e2e/support/env";

const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e/specs",
  fullyParallel: false,
  workers: 1,
  retries: isCi ? 2 : 0,
  timeout: 120_000,
  globalSetup: "./e2e/support/global-setup.ts",
  reporter: isCi ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: e2eOrigin,
    trace: isCi ? "on-first-retry" : "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    ...(typeof chromiumPath === "string" && chromiumPath !== ""
      ? {
          launchOptions: {
            executablePath: chromiumPath,
            args: ["--no-sandbox", "--disable-dev-shm-usage"],
          },
        }
      : {}),
  },
  webServer: {
    // `start` not `dev`: a second `tsx watch` kills the daily worker on the same sources.
    command: `pnpm --filter @watchdog/worker start & exec pnpm --filter @watchdog/web exec vite dev --host 127.0.0.1 --port ${e2eEnv.E2E_WEB_PORT} --strictPort`,
    url: e2eOrigin,
    reuseExistingServer: false,
    timeout: 180_000,
    env: e2eWebServerEnv(),
  },
});
