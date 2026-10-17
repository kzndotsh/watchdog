import { z } from "zod";

/** Shown in every secret error: how to make a good value. */
export const GENERATE_SECRET_HINT = "openssl rand -base64 32";

/**
 * The shortest accepted `BETTER_AUTH_SECRET` and `WD_MASTER_VAULT_KEY`: what
 * `openssl rand -hex 16` makes. `openssl rand -base64 32` (44 characters) and
 * `-hex 32` (64) clear it.
 */
export const MIN_SECRET_LENGTH = 32;

/**
 * Substrings that mark a value as a placeholder somebody forgot to replace.
 * Collected from `env.example` (before it shipped blank secrets), the docs and
 * the usual copy-paste values. Matched case-insensitively anywhere in the value.
 */
const PLACEHOLDER_MARKERS: readonly string[] = [
  "change-me",
  "changeme",
  "change_me",
  "replace-me",
  "replaceme",
  "your-secret",
  "your_secret",
  "your-key",
  "your_key",
  "placeholder",
  "generate-me",
  "<secret>",
  "xxxxxxxx",
];

/** Values that are placeholders only when they are the whole value. */
const PLACEHOLDER_VALUES = new Set<string>([
  "secret",
  "password",
  "default",
  "example",
  "todo",
  "test",
  "dev",
  "admin",
]);

/**
 * The local dev stack's object-store secret (`docker-compose.yml`). Fine on a
 * laptop, never in production.
 */
export const DEV_S3_SECRET = "watchdog-dev-secret";

export function isPlaceholderSecret(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    PLACEHOLDER_VALUES.has(normalized) ||
    PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker))
  );
}

type SecretOptions = {
  /** Minimum length; unset checks placeholders only. */
  readonly minLength?: number;
  /** Also reject the documented dev default when `NODE_ENV` is production. */
  readonly rejectDevDefault?: boolean;
};

/**
 * A non-empty trimmed string that is not a known placeholder and not shorter
 * than `minLength`. Error messages name the variable and how to generate a value.
 * The result is still `z.ZodString`-parsed text: the parsed type is `string`.
 */
export function secretString(name: string, options: SecretOptions = {}) {
  const { minLength, rejectDevDefault = false } = options;
  return z
    .string({
      error: (issue) =>
        issue.input === undefined
          ? `${name} is required. Generate one: ${GENERATE_SECRET_HINT}`
          : undefined,
    })
    .trim()
    .min(1, `${name} must not be empty. Generate one: ${GENERATE_SECRET_HINT}`)
    .refine((value) => minLength === undefined || value.length >= minLength, {
      error: `${name} is too short: it needs at least ${minLength} characters. Generate one: ${GENERATE_SECRET_HINT}`,
    })
    .refine((value) => !isPlaceholderSecret(value), {
      error: `${name} is a placeholder value, not a secret. Generate a real one: ${GENERATE_SECRET_HINT}`,
    })
    .refine(
      (value) =>
        !(
          rejectDevDefault &&
          process.env.NODE_ENV === "production" &&
          value === DEV_S3_SECRET
        ),
      {
        error: `${name} is the development default and must not be used in production. Generate a real one: ${GENERATE_SECRET_HINT}`,
      }
    );
}
