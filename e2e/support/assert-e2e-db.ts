/**
 * Run by the Playwright web server command before the worker and Vite start: the server
 * env (`e2eWebServerEnv`) must point at an e2e database, never the dev one.
 */
import process from "node:process";

import { assertE2eDatabases } from "./env";

try {
  assertE2eDatabases(process.env);
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
}
