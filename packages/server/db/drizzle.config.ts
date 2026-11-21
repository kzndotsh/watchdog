import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit cannot resolve `#env/server` in config — load repo-root
 * `.env` here. Use `fileURLToPath` (not `import.meta.dirname`); kit's bundler
 * leaves dirname undefined and breaks `generate`.
 */
// oxlint-disable-next-line unicorn/prefer-import-meta-properties -- see above
const configDir = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(configDir, "../../../.env") });

const url = process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL;
if (url === undefined || url === "") {
  throw new Error("DATABASE_URL_MIGRATE or DATABASE_URL is required");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
