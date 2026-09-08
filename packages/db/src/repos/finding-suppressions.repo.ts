import { and, eq, inArray } from "drizzle-orm";

import { trimmedOrUndefined } from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { findingSuppressions } from "../schema/finding-suppressions";
import { trimCaseId, trimResourceId } from "./_scoped-ids";

export type FindingSuppressionRow = typeof findingSuppressions.$inferSelect;

export interface NewFindingSuppression {
  caseId: string;
  fingerprint: string;
  reason: string;
  proposalId: string;
}

export const findingSuppressionsRepo = {
  async listFingerprints(
    exec: DbExec,
    caseId: string,
    fingerprints: string[]
  ): Promise<string[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined || fingerprints.length === 0) return [];
    const rows = await exec
      .select({ fingerprint: findingSuppressions.fingerprint })
      .from(findingSuppressions)
      .where(
        and(
          eq(findingSuppressions.caseId, scopedCaseId),
          inArray(findingSuppressions.fingerprint, fingerprints)
        )
      );
    return rows.map((r) => r.fingerprint);
  },

  async insertMany(exec: DbExec, rows: NewFindingSuppression[]): Promise<void> {
    const normalized = rows.flatMap((row) => {
      const scopedCaseId = trimCaseId(row.caseId);
      const scopedProposalId = trimResourceId(row.proposalId);
      const fingerprint = trimmedOrUndefined(row.fingerprint);
      const reason = trimmedOrUndefined(row.reason);
      if (
        scopedCaseId === undefined ||
        scopedProposalId === undefined ||
        fingerprint === undefined ||
        reason === undefined
      ) {
        return [];
      }
      return [
        {
          ...row,
          caseId: scopedCaseId,
          proposalId: scopedProposalId,
          fingerprint,
          reason,
        },
      ];
    });
    if (normalized.length === 0) return;
    await exec
      .insert(findingSuppressions)
      .values(normalized)
      .onConflictDoNothing();
  },
};
