import { validationVendorError } from "../errors/vendor-errors";

/** Normalize and restrict outbound HTTP targets to http(s) URLs. */
export function normalizeHttpUrl(raw: string): string {
  const trimmed = raw.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw validationVendorError(`Invalid URL: ${raw}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw validationVendorError(`URL must use http or https: ${raw}`);
  }
  return parsed.href;
}

/** Reject javascript:, file:, and other non-http(s) URL schemes. */
export function assertHttpUrlScheme(raw: string): void {
  const trimmed = raw.trim();
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  if (!schemeMatch) return;
  const scheme = schemeMatch[1].toLowerCase();
  if (scheme !== "http" && scheme !== "https") {
    throw validationVendorError(`URL must use http or https: ${raw}`);
  }
}
