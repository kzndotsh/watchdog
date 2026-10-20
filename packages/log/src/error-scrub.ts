/**
 * Scrubbing for error reports. The logger's redaction (paths, `init.ts`) has already run on a wide
 * event before it reaches the reporter; this is the second, stricter pass over what is about to
 * leave the process: keys that name a secret, Evidence content or a person are dropped by name, and
 * strings lose bearer tokens, URL credentials and queries, JWTs, emails, long opaque tokens and any
 * configured secret value verbatim.
 */

export const REDACTED = "[redacted]";

const MAX_DEPTH = 6;
const MAX_KEYS = 50;
const MAX_ARRAY = 20;
const MAX_STRING = 2000;
const MAX_INPUT = 100_000;
/** A secret shorter than this is not matched verbatim: it would shred ordinary words. */
const MIN_SECRET_LENGTH = 8;

/** Key names whose value never leaves: credentials, Evidence content and request bodies, people. */
const SENSITIVE_KEY =
  /pass(?:word|wd)?|secret|token|authorization|cookie|api[-_]?key|dsn|credential|session|private|signature|csrf|evidence|body|content|payload|email|(?:^|[-_.])ip(?:$|[-_.]|addr)|user[-_]?agent|vault|bearer/i;

const PATTERNS: readonly (readonly [RegExp, string])[] = [
  [/\bBearer\s+[\w.~+/=-]+/gi, `Bearer ${REDACTED}`],
  [
    /\b(authorization|x-api-key|api[-_]?key|token|secret|password|passwd|cookie)(["']?\s*[:=]\s*["']?)[^\s"',;&]+/gi,
    `$1$2${REDACTED}`,
  ],
  // credentials in a URL: scheme://user:pass@host
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, `$1${REDACTED}@`],
  // query strings and fragments can hold tokens
  [/(\bhttps?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/gi, "$1"],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, REDACTED],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, REDACTED],
  [/\b[0-9a-f]{32,}\b/gi, REDACTED],
  // a UUID is 36 characters, so 40+ opaque characters is a key, not an id
  [/\b[\w-]{40,}\b/g, REDACTED],
];

export type ScrubOptions = {
  /** Secret values (from the validated environment) removed from any string verbatim. */
  readonly secrets?: readonly string[];
};

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/** Longest first, so a secret that contains another is removed whole. */
function secretMatcher(secrets: readonly string[]): RegExp | null {
  const usable = secrets
    .filter((secret) => secret.length >= MIN_SECRET_LENGTH)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  return usable.length === 0 ? null : new RegExp(usable.join("|"), "g");
}

/** A scrubber closed over its secret list. */
export function createScrubber(options: ScrubOptions = {}) {
  const matcher = secretMatcher(options.secrets ?? []);

  function scrubText(text: string): string {
    // Redact first, truncate last: a secret that crosses the cutoff must not leak its prefix.
    // The input is capped only to bound the regex work.
    let out = text.length > MAX_INPUT ? text.slice(0, MAX_INPUT) : text;
    if (matcher !== null) out = out.replace(matcher, REDACTED);
    for (const [pattern, replacement] of PATTERNS) {
      out = out.replace(pattern, replacement);
    }
    return out.length > MAX_STRING ? out.slice(0, MAX_STRING) : out;
  }

  function scrubValue(value: unknown, depth = 0): unknown {
    if (typeof value === "string") return scrubText(value);
    if (value === null || value === undefined) return value;
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (depth >= MAX_DEPTH) return "[truncated]";
    if (Array.isArray(value)) {
      return value
        .slice(0, MAX_ARRAY)
        .map((item: unknown) => scrubValue(item, depth + 1));
    }
    if (typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(value).slice(0, MAX_KEYS)) {
        out[key] = SENSITIVE_KEY.test(key)
          ? REDACTED
          : scrubValue(item, depth + 1);
      }
      return out;
    }
    return undefined;
  }

  return { scrubText, scrubValue };
}

export type Scrubber = ReturnType<typeof createScrubber>;
