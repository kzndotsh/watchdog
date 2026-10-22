import { z } from "zod";

import { env } from "@watchdog/env/server";

const settingSchema = z.stringbool().default(false);

/**
 * Whether the operator enabled the breach Caps (`WD_ENABLE_BREACH_CAPS`, default off). Read at
 * call time, like `caseRetentionDays`, so every gate (availability, start-job, preflight,
 * Playbook start) and the catalog agree. Under `SKIP_ENV_VALIDATION` (lint, unit tests) `env`
 * holds the raw string, so the value is parsed again: anything unparsable counts as off.
 */
export function breachCapsEnabled(): boolean {
  const raw: unknown = env.WD_ENABLE_BREACH_CAPS;
  if (typeof raw === "boolean") return raw;
  const parsed = settingSchema.safeParse(raw);
  return parsed.success && parsed.data;
}

/** The reason a catalog entry, Job or Playbook start reports while the breach Caps are off. */
export const BREACH_DISABLED = "breach_disabled";

/** Head of the refusal text; the Cap id follows. Names the setting so an operator can act on it. */
export const BREACH_DISABLED_MESSAGE =
  "Breach Caps are off — an operator must set WD_ENABLE_BREACH_CAPS=1 (docs/reference/platform/cap-register.md) before running";
