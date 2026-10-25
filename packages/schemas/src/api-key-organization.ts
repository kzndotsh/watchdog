/**
 * Organization an API key was issued for (`metadata.organizationId`, set when the key is
 * created in the UI). The metadata is the JSON text Better Auth stores, or the parsed object.
 * Returns null when the key carries none; authentication refuses such a key.
 */
export function apiKeyOrganizationId(metadata: unknown): string | null {
  let parsed = metadata;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "organizationId" in parsed &&
    typeof parsed.organizationId === "string" &&
    parsed.organizationId !== ""
  ) {
    return parsed.organizationId;
  }
  return null;
}
