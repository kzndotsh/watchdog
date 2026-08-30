import process from "node:process";

/**
 * E2E environment defaults for Playwright.
 *
 * - `globalSetup` copies `e2eEnv` into the test-runner process so test-kit DB reset
 *   can connect before the webServer child starts.
 * - `webServer.env` uses `e2eWebServerEnv()` to pass the same values (plus inherited
 *   CI/shell env) into the Vite + worker child process.
 *
 * Override `E2E_*` / `DATABASE_URL` in the shell before invoking Playwright if you
 * need non-default ports or credentials.
 */
const webPort = process.env.E2E_WEB_PORT ?? "3300";
const minioPort = process.env.E2E_MINIO_PORT ?? "9100";

export const e2eOrigin = `http://127.0.0.1:${webPort}`;

function e2eEnvOr(key: string, fallback: string): string {
  const value = process.env[key];
  return value !== undefined && value !== "" ? value : fallback;
}

export const e2eEnv: Record<string, string> = {
  NODE_ENV: "development",
  E2E_WEB_PORT: webPort,
  DATABASE_URL: e2eEnvOr(
    "DATABASE_URL",
    "postgresql://watchdog_app:watchdog@127.0.0.1:5432/watchdog_e2e"
  ),
  DATABASE_URL_MIGRATE: e2eEnvOr(
    "DATABASE_URL_MIGRATE",
    "postgresql://postgres:postgres@127.0.0.1:5432/watchdog_e2e"
  ),
  BETTER_AUTH_SECRET: e2eEnvOr(
    "BETTER_AUTH_SECRET",
    "test-secret-must-be-at-least-32-chars"
  ),
  BETTER_AUTH_URL: e2eEnvOr("BETTER_AUTH_URL", e2eOrigin),
  BETTER_AUTH_ALLOW_SIGNUP: e2eEnvOr("BETTER_AUTH_ALLOW_SIGNUP", "1"),
  S3_ENDPOINT: e2eEnvOr("S3_ENDPOINT", `http://127.0.0.1:${minioPort}`),
  S3_ACCESS_KEY: e2eEnvOr("S3_ACCESS_KEY", "minioadmin"),
  S3_SECRET_KEY: e2eEnvOr("S3_SECRET_KEY", "minioadmin"),
  S3_BUCKET: e2eEnvOr("S3_BUCKET", "watchdog-evidence"),
  S3_REGION: e2eEnvOr("S3_REGION", "us-east-1"),
  WD_MASTER_VAULT_KEY: e2eEnvOr(
    "WD_MASTER_VAULT_KEY",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  ),
};

export function e2eWebServerEnv(): Record<string, string> {
  const inherited: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") inherited[key] = value;
  }
  return { ...inherited, ...e2eEnv };
}
