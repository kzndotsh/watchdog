import { existsSync } from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { z } from "zod";

const DEFAULT_API_URL = "http://localhost:3000/api/v1";

const cliEnvSchema = z.object({
  WD_API_URL: z.url().default(DEFAULT_API_URL),
  WD_API_KEY: z.string().min(1),
});

export type CliEnv = z.infer<typeof cliEnvSchema>;

let dotenvLoaded = false;
let cached: CliEnv | null = null;

/**
 * Load `.env` from cwd (then parents up to filesystem root). Safe for a
 * published CLI: never hardcodes the monorepo layout.
 */
function loadDotenvFromCwd(): void {
  if (dotenvLoaded) return;
  dotenvLoaded = true;

  let dir = process.cwd();
  for (;;) {
    const candidate = path.join(dir, ".env");
    if (existsSync(candidate)) {
      loadEnv({ path: candidate, quiet: true });
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}

/**
 * Memoized CLI env (`WD_API_URL` + `WD_API_KEY`). Call from `getConfig()` /
 * `api()` so `--help` works without a key. Do not call at module top-level.
 */
export function loadCliEnv(): CliEnv {
  if (cached !== null) return cached;
  loadDotenvFromCwd();
  cached = cliEnvSchema.parse({
    WD_API_URL: process.env.WD_API_URL,
    WD_API_KEY: process.env.WD_API_KEY,
  });
  return cached;
}

/** Test helper — clear memoized env between cases. */
export function resetCliEnvForTests(): void {
  cached = null;
  dotenvLoaded = false;
}
