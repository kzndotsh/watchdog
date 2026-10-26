import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import { evidence, type DbExec } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";

/**
 * Every Evidence row of a Case, newest captured first, for assertions: active rows by default,
 * soft-deleted ones with `hidden`. Tests read rows here rather than through the paged list.
 */
export async function listCaseEvidence(
  exec: DbExec,
  caseId: CaseId,
  opts?: { readonly hidden?: boolean }
): Promise<(typeof evidence.$inferSelect)[]> {
  return exec
    .select()
    .from(evidence)
    .where(
      and(
        eq(evidence.caseId, caseId),
        opts?.hidden === true
          ? isNotNull(evidence.deletedAt)
          : isNull(evidence.deletedAt)
      )
    )
    .orderBy(desc(evidence.capturedAt), desc(evidence.id));
}
