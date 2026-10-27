import { desc, eq } from "drizzle-orm";

import { graphWrites, jobs, type DbExec } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";

/**
 * Every Job row of a Case, most recently updated first, for assertions. Tests read rows here
 * rather than through the paged Job list (`jobList`).
 */
export async function listCaseJobs(
  exec: DbExec,
  caseId: CaseId
): Promise<(typeof jobs.$inferSelect)[]> {
  return exec
    .select()
    .from(jobs)
    .where(eq(jobs.caseId, caseId))
    .orderBy(desc(jobs.updatedAt), desc(jobs.id));
}

/**
 * Every Graph write row of a Case, newest first, for assertions. Tests read rows here rather
 * than through the paged write log (`graphWriteList`).
 */
export async function listCaseGraphWrites(
  exec: DbExec,
  caseId: CaseId
): Promise<(typeof graphWrites.$inferSelect)[]> {
  return exec
    .select()
    .from(graphWrites)
    .where(eq(graphWrites.caseId, caseId))
    .orderBy(desc(graphWrites.createdAt), desc(graphWrites.id));
}
