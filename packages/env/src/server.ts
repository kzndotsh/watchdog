import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { allEnvFields, createEnvOptions } from "./fragments";
import { lenientEnv } from "./lenient";
import { loadRepoEnv } from "./load";
import { readFieldMeta } from "./meta";

loadRepoEnv();

/**
 * Platform boot secrets for web / worker / db / core.
 * Cap API keys stay in the vault (`WD_MASTER_VAULT_KEY` + Settings).
 *
 * Call sites must use `env.FOO`. The `wd` CLI parses `WD_API_*` in-process
 * (see `@watchdog/cli`), not this package.
 * Set `SKIP_ENV_VALIDATION=1` only for lint/Docker without secrets (and unit tests): fields are
 * then parsed leniently on read, so a defaulted field still carries its schema default.
 */
export const env =
  process.env.SKIP_ENV_VALIDATION === "1"
    ? lenientEnv(allEnvFields, process.env)
    : createEnv({ server: allEnvFields, ...createEnvOptions });

/**
 * The values of every field marked `sensitive`, for scrubbing: error reports remove each of them
 * verbatim from any string before it leaves the process. The configured value is listed as well
 * as the parsed one, so a secret the schema refused (readable as unset under skipped
 * validation) is still scrubbed.
 */
export function sensitiveEnvValues(): string[] {
  const values: string[] = [];
  for (const [name, schema] of Object.entries<z.ZodType>(allEnvFields)) {
    if (readFieldMeta(z.globalRegistry.get(schema))?.sensitive !== true) {
      continue;
    }
    for (const value of [Reflect.get(env, name), process.env[name]]) {
      if (
        typeof value === "string" &&
        value !== "" &&
        !values.includes(value)
      ) {
        values.push(value);
      }
    }
  }
  return values;
}

/** What `initWatchdogLogger({ errorReporting })` takes: the DSN and labels, and the secrets to scrub. */
export function errorReportingSettings() {
  return {
    dsn: env.WD_ERROR_REPORTING_DSN,
    release: env.WD_RELEASE,
    environment: env.NODE_ENV,
    secrets: sensitiveEnvValues(),
  };
}

/** What `initWatchdogLogger({ otlp })` takes: the raw OTLP settings (validated by `@watchdog/log`). */
export function otlpSettings() {
  return {
    endpoint: env.WD_OTLP_ENDPOINT,
    headers: env.WD_OTLP_HEADERS,
    resourceAttributes: env.WD_OTLP_RESOURCE_ATTRIBUTES,
    release: env.WD_RELEASE,
    environment: env.NODE_ENV,
    secrets: sensitiveEnvValues(),
  };
}
