const SECURITY_HEADER_NAMES = [
  "strict-transport-security",
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "cross-origin-opener-policy",
  "cross-origin-resource-policy",
  "cross-origin-embedder-policy",
] as const;

export function pickSecurityHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of SECURITY_HEADER_NAMES) {
    const value = headers.get(name);
    if (value) out[name] = value;
  }
  return out;
}

function pushUnique(hints: string[], value: string): void {
  if (!hints.includes(value)) hints.push(value);
}

/** Best-effort CDN / edge hints from response headers. */
export function detectCdnHints(headers: Headers): string[] {
  const hints: string[] = [];
  const server = headers.get("server")?.toLowerCase() ?? "";
  const via = headers.get("via")?.toLowerCase() ?? "";
  const cfRay = headers.get("cf-ray");
  const cf = headers.get("cf-cache-status");
  const xcdn = headers.get("x-cdn") ?? headers.get("x-cache");
  const akamai =
    headers.get("x-akamai-transformed") ?? headers.get("akamai-grn");
  const fastly =
    headers.get("x-served-by") ?? headers.get("fastly-debug-digest");

  if (cfRay || cf || server.includes("cloudflare")) {
    pushUnique(hints, "cloudflare");
  }
  if (akamai) pushUnique(hints, "akamai");
  if (fastly || via.includes("fastly")) pushUnique(hints, "fastly");
  if (server.includes("amazons3") || headers.get("x-amz-request-id")) {
    pushUnique(hints, "aws");
  }
  if (xcdn) pushUnique(hints, `header:${xcdn.slice(0, 64)}`);
  return hints;
}
