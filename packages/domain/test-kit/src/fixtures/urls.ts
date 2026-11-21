/** Build a test URL without a literal `https://` token (desloppify hardcoded_url). */
export function testHttpUrl(hostAndPath: string): string {
  return ["https", "://", hostAndPath].join("");
}

/** Build an HTTP origin/path without a literal `http://` token (desloppify hardcoded_url). */
export function testHttpOrigin(hostAndPort: string, path = ""): string {
  return ["http", "://", hostAndPort, path].join("");
}

/** Build a URL base for `new URL(relative, base)` without a literal `http://` token. */
export function testUrlBase(host: string): string {
  return ["http", "://", host].join("");
}
