/** Keep these uppercase when title-casing dotted / snake ids. */
const ACRONYMS = new Set([
  "ai",
  "api",
  "css",
  "dns",
  "html",
  "http",
  "https",
  "ip",
  "json",
  "osint",
  "pgp",
  "sha",
  "sha256",
  "sql",
  "tls",
  "url",
  "whois",
]);

/** snake_case / dotted id → Title Case words (acronyms stay UPPER). */
export function titleCase(value: string): string {
  return value
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      return lower.replace(/^\w/, (c) => c.toUpperCase());
    })
    .join(" ");
}
