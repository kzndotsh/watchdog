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
 * need non-default ports or credentials. Both database URLs must name a database
 * with `e2e` in it: a shell that carries the dev `.env` (a `just` recipe loads it)
 * would otherwise point the suite at the dev database, where its sign-up specs
 * create users and organizations. `assertE2eDatabases` enforces it where a run
 * would touch a database (global setup, and the web server command before it
 * starts), not at config load, so `playwright test --list` works with any env.
 */
const webPort = process.env.E2E_WEB_PORT ?? "3300";
const s3Port = process.env.E2E_S3_PORT ?? "9100";

export const e2eOrigin = `http://127.0.0.1:${webPort}`;

function e2eEnvOr(key: string, fallback: string): string {
  const value = process.env[key];
  return value !== undefined && value !== "" ? value : fallback;
}

/** The database name in a Postgres URL (the path after the host). */
function databaseName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

const E2E_DATABASE_KEYS = ["DATABASE_URL", "DATABASE_URL_MIGRATE"] as const;

/**
 * Refuse database URLs that do not name an e2e database. Playwright writes users and
 * organizations through the sign-up specs, so a run must never reach the dev database.
 */
export function assertE2eDatabases(
  env: Readonly<Record<string, string | undefined>>
): void {
  for (const key of E2E_DATABASE_KEYS) {
    const url = env[key] ?? "";
    const name = databaseName(url);
    if (name === "") {
      throw new Error(
        `${key} is not a Postgres URL with a database name. Unset it to use the e2e default (watchdog_e2e), or point it at the e2e database.`
      );
    }
    if (!name.includes("e2e")) {
      throw new Error(
        `${key} names the database "${name}", not an e2e one. Playwright writes users and organizations through the sign-up specs, so it only runs against a database whose name contains "e2e" (default watchdog_e2e). Unset ${key} or point it at the e2e database.`
      );
    }
  }
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
  S3_ENDPOINT: e2eEnvOr("S3_ENDPOINT", `http://127.0.0.1:${s3Port}`),
  S3_ACCESS_KEY: e2eEnvOr("S3_ACCESS_KEY", "watchdog"),
  S3_SECRET_KEY: e2eEnvOr("S3_SECRET_KEY", "watchdog-dev-secret"),
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
