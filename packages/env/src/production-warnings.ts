/**
 * Settings that send data or credentials without TLS. A production process logs one warning for
 * each at start (web and worker call `startupWarnings`); nothing here refuses to start.
 *
 * "Local" is a host that never leaves the machine or the compose network: `localhost` and
 * `*.localhost`, 127.0.0.0/8, `::1`, and a name without a dot (a compose service such as
 * `postgres`). A dotted name is never local. Messages name the variable, never its value
 * (a DSN or OTLP endpoint can carry a key).
 */

type Source = Readonly<Record<string, string | undefined>>;

const IPV4_LOOPBACK = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const IPV4_ANY = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Database `sslmode` values that can send in the clear; `require` and stricter encrypt. */
const CLEARTEXT_SSLMODES = new Set(["disable", "allow", "prefer"]);

export function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replaceAll(/^\[|\]$/g, "");
  if (host === "") return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || IPV4_LOOPBACK.test(host)) return true;
  // An IPv4-mapped loopback (`::ffff:127.0.0.1`, which URL parsing writes `::ffff:7f00:1`).
  if (/^::ffff:(?:127\.|7f[0-9a-f]{2}:)/.test(host)) return true;
  // A bare name resolves inside the compose network; an IPv4 literal has dots and is not local.
  return !host.includes(".") && !host.includes(":") && !IPV4_ANY.test(host);
}

function parse(value: string | undefined): URL | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  try {
    return new URL(value.trim());
  } catch {
    return undefined;
  }
}

function plainHttp(name: string, value: string | undefined): string[] {
  const url = parse(value);
  return url?.protocol === "http:" && !isLocalHost(url.hostname)
    ? [
        `${name} is an http: URL on a non-local host: traffic to it is not encrypted. Use https:.`,
      ]
    : [];
}

function databaseWarning(value: string | undefined): string[] {
  const url = parse(value);
  if (url === undefined || isLocalHost(url.hostname)) return [];
  const mode = url.searchParams.get("sslmode");
  if (mode !== null && !CLEARTEXT_SSLMODES.has(mode.toLowerCase())) return [];
  return [
    `DATABASE_URL points at a non-local host without TLS (${mode === null ? "no sslmode" : `sslmode=${mode}`}): the password and every query travel unencrypted. Add sslmode=require (or verify-full).`,
  ];
}

/** A DSN's host is after the `@`; `new URL` reads it the same way. */
function dsnWarning(value: string | undefined): string[] {
  const url = parse(value);
  return url?.protocol === "http:" && !isLocalHost(url.hostname)
    ? [
        "WD_ERROR_REPORTING_DSN is an http: DSN on a non-local host: error reports are not encrypted. Use https:.",
      ]
    : [];
}

/**
 * The warnings for `source` (the process environment), empty outside production. One entry per
 * setting that matches, in a fixed order.
 */
export function transportWarnings(source: Source): string[] {
  if (source.NODE_ENV !== "production") return [];
  return [
    ...databaseWarning(source.DATABASE_URL),
    ...plainHttp("BETTER_AUTH_URL", source.BETTER_AUTH_URL),
    ...plainHttp("S3_PUBLIC_URL", source.S3_PUBLIC_URL),
    ...plainHttp("WD_OTLP_ENDPOINT", source.WD_OTLP_ENDPOINT),
    ...dsnWarning(source.WD_ERROR_REPORTING_DSN),
  ];
}

/**
 * `SKIP_ENV_VALIDATION=1` turns every check off, so a production process must not carry it.
 * Build and lint steps that set it run without `NODE_ENV=production` (the Dockerfile exports
 * `SKIP_ENV_VALIDATION` nowhere), so refusing at the first `/server` import costs them nothing.
 */
export function assertValidationNotSkipped(source: Source): void {
  if (source.SKIP_ENV_VALIDATION === "1" && source.NODE_ENV === "production") {
    throw new Error(
      "SKIP_ENV_VALIDATION=1 is set while NODE_ENV is production: it turns off every environment check and is for lint and image builds only. Unset it."
    );
  }
}
