import type { EnvFieldMeta } from "./meta";

/**
 * Variables read outside `@watchdog/env/server`: the container entrypoint and
 * migrator, the `wd` CLI, the marketing site, the log package and the
 * production compose file. They have no Zod field, so their metadata is
 * written out here; the generated `env.example` and configuration reference
 * list them next to the validated fields.
 */
export type ProcessVariable = EnvFieldMeta & {
  readonly name: string;
  readonly group: string;
  readonly required: boolean;
  /** What applies when unset, as text. */
  readonly default?: string;
  /** Listed in the development `env.example` (commented out unless `example` is set). */
  readonly inExample?: boolean;
};

const CONTAINER = "Container and process";
const CLI = "CLI (wd)";
const COMPOSE = "Compose (docker-compose.prod.yml)";

export const processVariables: readonly ProcessVariable[] = [
  {
    name: "WD_SKIP_MIGRATIONS",
    group: CONTAINER,
    description:
      "1, true, yes or on skips migrations at container start; 0, false, no, off or empty runs them. The web image runs them; the worker image sets 1.",
    sensitive: false,
    required: false,
    default: "0 (web), 1 (worker image)",
    usedBy: ["migrate"],
  },
  {
    name: "WD_MIGRATIONS_DIR",
    group: CONTAINER,
    description:
      "Folder of migrations. The image sets /app/drizzle; only tests change it.",
    sensitive: false,
    required: false,
    default: "packages/db/drizzle",
    usedBy: ["migrate"],
  },
  {
    name: "WD_LOG_DIR",
    group: CONTAINER,
    description:
      "Folder of the NDJSON log drain, for a read-only or non-writable app directory. The image sets /tmp/evlog; stdout carries the same events.",
    sensitive: false,
    required: false,
    default: "the app's own log folder",
    usedBy: ["web", "worker"],
  },
  {
    name: "WD_CLIENT_DIR",
    group: CONTAINER,
    description:
      "Folder of the built browser assets the production server serves. The web image sets /app/client.",
    sensitive: false,
    required: false,
    default: "apps/web/dist/client",
    usedBy: ["web"],
  },
  {
    name: "PORT",
    group: CONTAINER,
    description: "Port the production web server listens on.",
    sensitive: false,
    required: false,
    default: "3000",
    usedBy: ["web"],
  },
  {
    name: "HOST",
    group: CONTAINER,
    description: "Address the production web server binds.",
    sensitive: false,
    required: false,
    default: "0.0.0.0",
    usedBy: ["web"],
  },
  {
    name: "SKIP_ENV_VALIDATION",
    group: CONTAINER,
    description:
      "1 skips environment validation (lint and image builds without secrets). Never set it in a deployment.",
    sensitive: false,
    required: false,
    usedBy: ["web", "worker"],
    inExample: true,
  },
  {
    name: "WD_API_URL",
    group: CLI,
    description: "Base URL of the Watchdog API the wd CLI calls.",
    sensitive: false,
    required: false,
    default: "http://localhost:3000/api/v1",
    usedBy: ["cli"],
    inExample: true,
    example: "http://localhost:3000/api/v1",
  },
  {
    name: "WD_API_KEY",
    group: CLI,
    description:
      "API key the wd CLI sends (create one in Settings, API Keys). Read lazily: --help works without it.",
    sensitive: true,
    required: true,
    usedBy: ["cli"],
    inExample: true,
  },
  {
    name: "WD_CLI_HELP",
    group: CLI,
    description: "0 turns off the help[] hints on the CLI's JSON output.",
    sensitive: false,
    required: false,
    default: "on",
    usedBy: ["cli"],
    inExample: true,
  },
  {
    name: "WD_CLI_DEBUG",
    group: CLI,
    description: "1 prints stack traces on stderr.",
    sensitive: false,
    required: false,
    default: "off",
    usedBy: ["cli"],
    inExample: true,
  },
  {
    name: "PUBLIC_APP_URL",
    group: "Marketing site",
    description:
      "URL of the app the marketing site links to (Astro build time only).",
    sensitive: false,
    required: false,
    default: "http://127.0.0.1:3000",
    usedBy: ["site"],
    inExample: true,
  },
  {
    name: "POSTGRES_DB",
    group: COMPOSE,
    description: "Database name of the Postgres container.",
    sensitive: false,
    required: false,
    default: "watchdog",
    usedBy: [],
  },
  {
    name: "POSTGRES_USER",
    group: COMPOSE,
    description:
      "Owner role of the Postgres container; the stack builds DATABASE_URL_MIGRATE from it.",
    sensitive: false,
    required: false,
    default: "watchdog",
    usedBy: [],
  },
  {
    name: "POSTGRES_PASSWORD",
    group: COMPOSE,
    description:
      "Password of that role, the owner of the database (migrations and admin commands). Letters and digits only: it is placed in a connection URL (openssl rand -hex 24).",
    sensitive: true,
    required: true,
    usedBy: [],
  },
  {
    name: "POSTGRES_APP_PASSWORD",
    group: COMPOSE,
    description:
      "Password of the application role watchdog_app, which the web app and worker use (DATABASE_URL). The Postgres container creates the role with it when the volume is first made. Letters and digits only, and different from POSTGRES_PASSWORD (openssl rand -hex 24).",
    sensitive: true,
    required: true,
    usedBy: [],
  },
  {
    name: "WEB_BIND",
    group: COMPOSE,
    description:
      "Host address the web port binds. Loopback by default: publish it through a TLS reverse proxy.",
    sensitive: false,
    required: false,
    default: "127.0.0.1",
    usedBy: [],
  },
  {
    name: "WEB_PORT",
    group: COMPOSE,
    description: "Host port of the web container.",
    sensitive: false,
    required: false,
    default: "3000",
    usedBy: [],
  },
  {
    name: "S3_PUBLISH_PORT",
    group: COMPOSE,
    description:
      "Loopback host port of the object store (for the reverse proxy).",
    sensitive: false,
    required: false,
    default: "9100",
    usedBy: [],
  },
  {
    name: "WATCHDOG_WEB_IMAGE",
    group: COMPOSE,
    description: "Image name of the web service.",
    sensitive: false,
    required: false,
    default: "watchdog-web:local",
    usedBy: [],
  },
  {
    name: "WATCHDOG_WORKER_IMAGE",
    group: COMPOSE,
    description: "Image name of the worker service.",
    sensitive: false,
    required: false,
    default: "watchdog-worker:local",
    usedBy: [],
  },
];
