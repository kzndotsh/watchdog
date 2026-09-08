import { validationToolsError } from "../errors/tools-error";

/** Normalize and restrict Wayback targets to http(s) URLs. */
export function normalizeWaybackUrl(raw: string): string {
  const trimmed = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw validationToolsError(`Invalid URL: ${raw}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw validationToolsError(`URL must use http or https: ${raw}`);
  }
  return parsed.href;
}
