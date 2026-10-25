import {
  DEFAULT_AI_PRIVATE_ORIGINS,
  parseAiPrivateOrigins,
} from "@watchdog/env/ai-origins";
import { env } from "@watchdog/env/server";

/**
 * The private or loopback origins a Job's model call may reach (`WD_AI_PRIVATE_ORIGINS`),
 * read when a Job starts, like `breachCapsEnabled`. Under `SKIP_ENV_VALIDATION` (lint, unit
 * tests) `env` holds the raw string, or nothing: the default applies then, and an unparsable
 * value lists none, so a bad setting never widens what a Job may reach.
 */
export function aiPrivateOrigins(): readonly string[] {
  const raw: unknown = env.WD_AI_PRIVATE_ORIGINS;
  return (
    parseAiPrivateOrigins(
      typeof raw === "string" ? raw : DEFAULT_AI_PRIVATE_ORIGINS
    ) ?? []
  );
}
