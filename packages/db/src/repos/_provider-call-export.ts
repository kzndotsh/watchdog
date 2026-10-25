import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";

import type { CaseId } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { evidence } from "../schema/evidence";
import {
  evidenceProviderCalls,
  providerCallOutcomes,
} from "../schema/provider-calls";

/**
 * One page of the calls that back the Case's exported Evidence (active rows only), by call id,
 * each with the ids of the exported Evidence it backs. A call that backs only deleted Evidence
 * is absent. `storedOnly` keeps the calls whose raw body is stored (the size pass reads only
 * those). The per-call list is an aggregate (`array_agg`), which has no builder, so it lives
 * here, outside `*.repo.ts`, like `_evidence-landed.ts`.
 */
export async function selectExportCallLinks(
  exec: DbExec,
  caseId: CaseId,
  page: { after?: string; limit: number; storedOnly?: boolean }
): Promise<{ callId: string; evidenceIds: string[] }[]> {
  return exec
    .select({
      callId: evidenceProviderCalls.callId,
      evidenceIds: sql<
        string[]
      >`array_agg(${evidenceProviderCalls.evidenceId}::text order by ${evidenceProviderCalls.evidenceId})`,
    })
    .from(evidenceProviderCalls)
    .innerJoin(
      evidence,
      and(
        eq(evidence.id, evidenceProviderCalls.evidenceId),
        eq(evidence.caseId, evidenceProviderCalls.caseId)
      )
    )
    .leftJoin(
      providerCallOutcomes,
      eq(providerCallOutcomes.callId, evidenceProviderCalls.callId)
    )
    .where(
      and(
        eq(evidenceProviderCalls.caseId, caseId),
        isNull(evidence.deletedAt),
        page.storedOnly === true
          ? eq(providerCallOutcomes.bodyState, "stored")
          : undefined,
        page.after === undefined
          ? undefined
          : gt(evidenceProviderCalls.callId, page.after)
      )
    )
    .groupBy(evidenceProviderCalls.callId)
    .orderBy(asc(evidenceProviderCalls.callId))
    .limit(page.limit);
}
