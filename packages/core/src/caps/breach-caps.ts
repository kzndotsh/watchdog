import { capVersion, isBreachCap } from "@watchdog/caps";
import {
  breachCapsModeSchema,
  type BreachCapsMode,
} from "@watchdog/env/breach-caps-mode";
import { env } from "@watchdog/env/server";

/**
 * The operator's breach Caps mode (`WD_BREACH_CAPS`: `off`, `safe` or `full`, default `off`).
 * Read at call time, like `caseRetentionDays`, so every gate (availability, start-job, preflight,
 * Playbook start), the catalog, the Cap context and the Export agree. Under
 * `SKIP_ENV_VALIDATION` (lint, unit tests) `env` holds the raw string, so the value is parsed
 * again: anything unparsable counts as `off`.
 */
export function breachCapsMode(): BreachCapsMode {
  const raw: unknown = env.WD_BREACH_CAPS;
  const parsed = breachCapsModeSchema.safeParse(raw);
  return parsed.success ? parsed.data : "off";
}

/** Whether the breach Caps may run at all (`safe` or `full`). */
export function breachCapsEnabled(): boolean {
  return breachCapsMode() !== "off";
}

/** The reason a catalog entry, Job or Playbook start reports while the breach Caps are off. */
export const BREACH_DISABLED = "breach_disabled";

/** Head of the refusal text; the Cap id follows. Names the setting so an operator can act on it. */
export const BREACH_DISABLED_MESSAGE =
  "Breach Caps are off — an operator must set WD_BREACH_CAPS=safe or WD_BREACH_CAPS=full (docs/reference/platform/cap-register.md) before running";

/** Separates a breach Cap's code fingerprint from the mode it was claimed under. */
const MODE_SEPARATOR = "+";

/**
 * The version a Job of this Cap is stamped with at claim (`jobs.cap_version`). A breach Cap's
 * version carries the mode (`<fingerprint>+safe`), because the mode decides what its artifacts
 * hold: the result cache is keyed by this version, so a `full` result (plaintext credentials)
 * is never served to a `safe` Job, and the reverse. Any other Cap's version is its fingerprint.
 */
export function stampedCapVersion(
  capabilityId: string,
  mode: BreachCapsMode
): string {
  const version = capVersion(capabilityId);
  return isBreachCap({ id: capabilityId })
    ? `${version}${MODE_SEPARATOR}${mode}`
    : version;
}

/**
 * What a breach Cap run keeps of credentials, read from the version the Job was stamped with, so
 * the run and its cache entry cannot disagree. A version with no mode, or `off`, counts as
 * `safe`: the stricter treatment is the default.
 */
export function credentialModeOfVersion(stamped: string): "safe" | "full" {
  return stamped.endsWith(`${MODE_SEPARATOR}full`) ? "full" : "safe";
}
