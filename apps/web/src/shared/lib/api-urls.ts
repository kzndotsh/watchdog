/**
 * REST paths the web links to or fetches directly (outside oRPC). Build them here so a
 * path change cannot leave a dead download link; the handlers live under `routes/api/v1/`.
 */
const API_V1 = "/api/v1";

/** Zip of the whole Case: entity Markdown plus Evidence. */
export function caseExportZipPath(caseId: string): string {
  return `${API_V1}/cases/${caseId}/export.zip`;
}

/** Status and expiring download link of a large Case export (the Job `export.zip` answered 202 with). */
export function caseExportDownloadPath(caseId: string, jobId: string): string {
  return `${API_V1}/cases/${caseId}/exports/${jobId}`;
}

/** Markdown export of one Entity's Dossier. */
export function entityMarkdownExportPath(
  caseId: string,
  entitySlug: string
): string {
  return `${API_V1}/cases/${caseId}/entities/${encodeURIComponent(entitySlug)}/export.md`;
}
