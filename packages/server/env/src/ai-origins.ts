/**
 * The one parser of the `WD_AI_PRIVATE_ORIGINS` setting, shared by the env schema and core.
 * Pure: no process state.
 */

/** The local model address Watchdog's default `AI_COMPAT_BASE_URL` points at. */
export const DEFAULT_AI_PRIVATE_ORIGINS = "http://127.0.0.1:8080";

/** The value that lists no private origin at all. */
export const NO_AI_PRIVATE_ORIGINS = "none";

/**
 * The origins a comma-separated list names (`scheme://host[:port]`, no path, no credentials),
 * normalized as URLs write them; `none` is an empty list. `null` when any entry is not an
 * http(s) origin.
 */
export function parseAiPrivateOrigins(raw: string): string[] | null {
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  if (entries.length === 1 && entries[0] === NO_AI_PRIVATE_ORIGINS) return [];
  const origins: string[] = [];
  for (const entry of entries) {
    try {
      const url = new URL(entry);
      const http = url.protocol === "http:" || url.protocol === "https:";
      const bare =
        url.username === "" &&
        url.password === "" &&
        url.pathname === "/" &&
        url.search === "" &&
        url.hash === "";
      if (!http || !bare) return null;
      origins.push(url.origin);
    } catch {
      return null;
    }
  }
  return origins;
}
