import { parseAiPrivateOrigins } from "@watchdog/env/ai-origins";
import { env } from "@watchdog/env/server";

/**
 * The private or loopback origins a Job's model call may reach (`WD_AI_PRIVATE_ORIGINS`),
 * read when a Job starts, like `breachCapsEnabled`. The schema refuses an unparsable value, so
 * the empty fallback is never reached.
 */
export function aiPrivateOrigins(): readonly string[] {
  return parseAiPrivateOrigins(env.WD_AI_PRIVATE_ORIGINS) ?? [];
}
