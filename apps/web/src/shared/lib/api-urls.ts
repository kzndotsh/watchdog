/**
 * REST paths the web links to or fetches directly (outside oRPC). Build them here so a
 * path change cannot leave a dead download link; the handlers live under `routes/api/v1/`.
 */
const API_V1 = "/api/v1";

/** The query parameter that asks a Case export to carry raw provider responses (owners and admins). */
export const RAW_BODIES_PARAM = "rawBodies";

/** The query parameter that asks a Case export to keep recovered passwords and hashes in breach Evidence (owners and admins, `full` mode). */
export const BREACH_CREDENTIALS_PARAM = "breachCredentials";

/**
 * Zip of the whole Case: entity Markdown, Evidence and the provider calls behind it. With
 * `shouldIncludeRawBodies` the export also asks for the raw provider responses its terms allow; the
 * server refuses anyone who is not a signed-in owner or admin. With `shouldIncludeBreachCredentials` it
 * keeps the passwords and hashes in breach Evidence (same gate, and only in `full` mode).
 */
export function caseExportZipPath(
  caseId: string,
  options: {
    shouldIncludeRawBodies?: boolean;
    shouldIncludeBreachCredentials?: boolean;
  } = {}
): string {
  const path = `${API_V1}/cases/${caseId}/export.zip`;
  const query = new URLSearchParams();
  if (options.shouldIncludeRawBodies === true) {
    query.set(RAW_BODIES_PARAM, "1");
  }
  if (options.shouldIncludeBreachCredentials === true) {
    query.set(BREACH_CREDENTIALS_PARAM, "1");
  }
  const text = query.toString();
  return text === "" ? path : `${path}?${text}`;
}

/** Status and expiring download link of a large Case export (the Job `export.zip` answered 202 with). */
export function caseExportDownloadPath(caseId: string, jobId: string): string {
  return `${API_V1}/cases/${caseId}/exports/${jobId}`;
}

/** The stored raw response of a provider call, served as an attachment of generic bytes. */
export function providerCallResponsePath(
  caseId: string,
  callId: string
): string {
  return `${API_V1}/cases/${caseId}/provider-calls/${callId}/response`;
}

/** Markdown export of one Entity's Dossier. */
export function entityMarkdownExportPath(
  caseId: string,
  entitySlug: string
): string {
  return `${API_V1}/cases/${caseId}/entities/${encodeURIComponent(entitySlug)}/export.md`;
}
