import path from "node:path";

import { config as loadEnv } from "dotenv";

let loaded = false;

/**
 * Load repo-root `.env` once via an absolute path (safe with spaces).
 * `packages/env/src` → three levels up to the monorepo root.
 * Vitest sets `VITEST`: tests never read the developer's `.env`, so a local `WD_*` value
 * cannot change a result (they set what they depend on with `vi.stubEnv`).
 */
export function loadRepoEnv(): void {
  if (loaded || process.env.VITEST) return;
  loaded = true;
  loadEnv({
    path: path.join(import.meta.dirname, "../../../.env"),
    quiet: true,
  });
}
