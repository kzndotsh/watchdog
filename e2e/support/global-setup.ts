/**
 * Playwright globalSetup: seeds process.env for test-kit DB reset (runs in the
 * test runner process before webServer starts). webServer.env covers the app child only.
 */
import process from "node:process";

import { e2eEnv } from "./env";

export default async function globalSetup(): Promise<void> {
  for (const [key, value] of Object.entries(e2eEnv)) {
    process.env[key] = value;
  }
}
