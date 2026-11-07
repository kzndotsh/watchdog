import { validationVendorError } from "../errors/vendor-errors";

/** Normalize email → lowercase local@domain; throws if shape is wrong. */
export function normalizeEmail(raw: string): { email: string; domain: string } {
  const trimmed = raw.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) {
    throw validationVendorError(`Invalid email: ${raw}`);
  }
  const domain = trimmed.slice(at + 1);
  if (!domain.includes(".") || domain.includes(" ")) {
    throw validationVendorError(`Invalid email domain: ${raw}`);
  }
  return { email: trimmed, domain };
}
