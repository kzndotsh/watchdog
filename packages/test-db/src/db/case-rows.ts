import { and, asc, desc, eq } from "drizzle-orm";

import { changesets, jobs, type DbExec } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";

import { readInCaseOrganizationScope } from "./organization-scope.ts";

/**
 * Every Job row of a Case, most recently updated first, for assertions. Tests read rows here
 * rather than through the paged Job list (`jobList`).
 */
export async function listCaseJobs(
  exec: DbExec,
  caseId: CaseId
): Promise<(typeof jobs.$inferSelect)[]> {
  return readInCaseOrganizationScope(exec, caseId, async (tx) =>
    tx
      .select()
      .from(jobs)
      .where(eq(jobs.caseId, caseId))
      .orderBy(desc(jobs.updatedAt), desc(jobs.id))
  );
}

/**
 * Every agent graph write of a Case (its `agent_write` changesets), newest first, for assertions.
 * Tests read rows here rather than through the paged write log (`graphWriteList`).
 */
export async function listCaseGraphWrites(
  exec: DbExec,
  caseId: CaseId
): Promise<(typeof changesets.$inferSelect)[]> {
  return readInCaseOrganizationScope(exec, caseId, async (tx) =>
    tx
      .select()
      .from(changesets)
      .where(
        and(
          eq(changesets.caseId, caseId),
          eq(changesets.channel, "agent_write")
        )
      )
      .orderBy(desc(changesets.createdAt), desc(changesets.id))
  );
}

/** Every changeset of a Case, whatever the channel, oldest first, for assertions. */
export async function listCaseChangesets(
  exec: DbExec,
  caseId: CaseId
): Promise<(typeof changesets.$inferSelect)[]> {
  return readInCaseOrganizationScope(exec, caseId, async (tx) =>
    tx
      .select()
      .from(changesets)
      .where(eq(changesets.caseId, caseId))
      .orderBy(asc(changesets.createdAt), asc(changesets.id))
  );
}
