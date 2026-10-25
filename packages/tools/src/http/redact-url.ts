/** Credential values shorter than this are not registered: too short to find by value. */
export const MIN_SECRET_LENGTH = 8;

/**
 * Query parameter names whose value is never recorded, whatever it is (compared lowercase).
 * Registered credential values are replaced everywhere by value; this list covers a secret
 * the Job never read from the vault (an OAuth `code`, a signed URL, a key in the seed).
 */
const SENSITIVE_PARAMS: ReadonlySet<string> = new Set([
  "key",
  "apikey",
  "api_key",
  "api-key",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "client_secret",
  "sig",
  "signature",
  "x-amz-signature",
  "code",
  "state",
  "password",
]);

/**
 * A parameter is also sensitive when its name, split on `-`, `_`, `.` and camelCase
 * boundaries, has one of these as a whole token (`auth_token`, `x-api-key`, `sessionToken`);
 * `keyword` is one token that is not in the set, so it stays.
 */
const SENSITIVE_TOKENS: ReadonlySet<string> = new Set([
  "key",
  "token",
  "secret",
  "password",
  "passwd",
  "auth",
  "authorization",
  "sig",
  "signature",
  "apikey",
  "code",
  "state",
]);

function isSensitiveName(rawName: string): boolean {
  const name = safeDecode(rawName);
  if (SENSITIVE_PARAMS.has(name.toLowerCase())) return true;
  return name
    .replaceAll(/([a-z\d])([A-Z])/g, "$1 $2")
    .split(/[\s\-_.]+/)
    .some((token) => SENSITIVE_TOKENS.has(token.toLowerCase()));
}

const REDACTED = "[redacted]";
const PLACEHOLDER = /^\[credential:[^\]]+\]$/;

function lowerHexEscapes(text: string): string {
  return text.replaceAll(/%[\dA-F]{2}/g, (m) => m.toLowerCase());
}

/** The forms a value takes in a URL: raw, percent-encoded, form-encoded and as the URL parser writes it. */
function variantsOf(value: string): Set<string> {
  const forms = new Set<string>([value]);
  const add = (form: string) => {
    forms.add(form);
    forms.add(lowerHexEscapes(form));
  };
  add(encodeURIComponent(value));
  add(encodeURI(value));
  add(new URLSearchParams([["", value]]).toString().slice(1));
  try {
    add(new URL(`http://h/?${value}`).search.slice(1));
    add(new URL(`http://h/${value}`).pathname.slice(1));
  } catch {
    // A value the parser refuses cannot appear in a parsed URL in that form.
  }
  forms.delete("");
  return forms;
}

/**
 * The credential values a Job has revealed, found again by value. Core registers each secret
 * the Cap reads through `getCredential`; a replaced value shows as `[credential:NAME]`.
 */
export class SecretRegistry {
  private readonly names = new Map<string, string>();
  private ordered: readonly (readonly [string, string])[] = [];

  /** Registers a revealed secret; a value under `MIN_SECRET_LENGTH` characters is ignored. */
  register(name: string, value: string): void {
    if (value.length < MIN_SECRET_LENGTH) return;
    for (const form of variantsOf(value)) this.names.set(form, name);
    // Longest first, so a value that contains another is replaced whole.
    this.ordered = [...this.names].sort((a, b) => b[0].length - a[0].length);
  }

  /** `text` with every registered form of every secret replaced by its `[credential:NAME]` label. */
  replaceIn(text: string): string {
    let out = text;
    for (const [form, name] of this.ordered) {
      if (out.includes(form)) {
        out = out.replaceAll(form, `[credential:${name}]`);
      }
    }
    return out;
  }
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text.replaceAll("+", " "));
  } catch {
    return text;
  }
}

function redactPair(pair: string, secrets: SecretRegistry | undefined): string {
  const eq = pair.indexOf("=");
  const rawName = eq === -1 ? pair : pair.slice(0, eq);
  const rawValue = eq === -1 ? "" : pair.slice(eq + 1);
  const value = secrets?.replaceIn(rawValue) ?? rawValue;
  const name = secrets?.replaceIn(rawName) ?? rawName;
  if (!isSensitiveName(rawName)) {
    return eq === -1 ? name : `${name}=${value}`;
  }
  return `${name}=${PLACEHOLDER.test(value) ? value : REDACTED}`;
}

/**
 * A URL safe to store: no userinfo, no fragment, every registered secret value (raw,
 * percent-encoded or form-encoded) shown as `[credential:NAME]`, and the value of a
 * sensitive parameter name replaced. A URL that does not parse is not echoed.
 */
export function redactUrl(
  input: string | URL,
  secrets?: SecretRegistry
): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return "[invalid url]";
  }
  const base = `${url.protocol}//${url.host}${url.pathname}`;
  const path = secrets?.replaceIn(base) ?? base;
  if (url.search.length <= 1) return path;
  const query = url.search
    .slice(1)
    .split("&")
    .map((pair) => redactPair(pair, secrets))
    .join("&");
  return `${path}?${query}`;
}

/** A `Location` value (possibly relative to `base`) as a redacted absolute URL. */
export function redactLocation(
  location: string,
  base: string,
  secrets?: SecretRegistry
): string {
  try {
    return redactUrl(new URL(location, base), secrets);
  } catch {
    return "[invalid url]";
  }
}
