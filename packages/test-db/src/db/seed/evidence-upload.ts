import { and, asc, eq } from "drizzle-orm";

import { evidenceUploads, type DbExec } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";

/**
 * Backdate when a presigned upload was issued (`created_at`), so a sweep test can age it past the
 * grace window. Production code only ever sets it to now (a repeat presign), so no repo method
 * takes a date; this writes the column directly.
 */
export async function backdateEvidenceUpload(
  exec: DbExec,
  caseId: CaseId,
  uri: string,
  createdAt: Date
): Promise<void> {
  await exec
    .update(evidenceUploads)
    .set({ createdAt })
    .where(
      and(eq(evidenceUploads.caseId, caseId), eq(evidenceUploads.uri, uri))
    );
}

/** The object keys of a Case's recorded presigned uploads, oldest first (what the sweep leaves). */
export async function listEvidenceUploadUris(
  exec: DbExec,
  caseId: CaseId
): Promise<string[]> {
  const rows = await exec
    .select({ uri: evidenceUploads.uri })
    .from(evidenceUploads)
    .where(eq(evidenceUploads.caseId, caseId))
    .orderBy(asc(evidenceUploads.createdAt), asc(evidenceUploads.uri));
  return rows.map((row) => row.uri);
}
