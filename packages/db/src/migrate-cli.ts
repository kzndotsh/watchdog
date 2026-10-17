/**
 * Apply pending migrations without drizzle-kit (a dev dependency): the container entrypoint
 * runs this file, bundled as `migrate.mjs`. Reads `DATABASE_URL_MIGRATE`, else `DATABASE_URL`
 * (the `drizzle.config.ts` rule), and the folder from `WD_MIGRATIONS_DIR` (default
 * `packages/db/drizzle`). Exits 1 on any failure.
 */
import path from "node:path";

import { runMigrations } from "./migrate";

/** An environment variable's value, with unset and empty both meaning "not given". */
function envOr(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

const url = envOr("DATABASE_URL_MIGRATE", envOr("DATABASE_URL", ""));
if (url === "") {
  process.stderr.write(
    "migrate: DATABASE_URL_MIGRATE or DATABASE_URL is required\n"
  );
  process.exit(1);
}

const migrationsFolder = envOr(
  "WD_MIGRATIONS_DIR",
  path.resolve(import.meta.dirname, "../drizzle")
);

try {
  process.stdout.write(
    `migrate: applying migrations from ${migrationsFolder}\n`
  );
  await runMigrations({ url, migrationsFolder });
  process.stdout.write("migrate: done\n");
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`migrate: failed: ${detail}\n`);
  process.exit(1);
}
