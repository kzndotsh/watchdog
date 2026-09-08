import { and, eq, gt } from "drizzle-orm";

import { trimmedOrNull, trimmedOrUndefined } from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { capCache } from "../schema/cap-cache";
import { jobs, type JobArtifact } from "../schema/jobs";
import { trimCaseId, trimResourceId } from "./_scoped-ids";

export type CapCacheRow = typeof capCache.$inferSelect;

export interface CapCacheLookup {
  artifacts: JobArtifact[];
  resultSummary: string | null;
  jobId: string | null;
  evidenceIds: string[];
}

export interface UpsertCapCacheValues {
  caseId: string;
  capabilityId: string;
  inputHash: string;
  jobId: string;
  artifacts: JobArtifact[];
  resultSummary: string | null;
  ttlMs: number;
  createdAt: Date;
  expiresAt: Date;
}

export const capCacheRepo = {
  async lookupActive(
    exec: DbExec,
    caseId: string,
    capabilityId: string,
    inputHash: string,
    now: Date
  ): Promise<CapCacheLookup | null> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedCapabilityId = trimmedOrUndefined(capabilityId);
    const scopedInputHash = trimmedOrUndefined(inputHash);
    if (
      scopedCaseId === undefined ||
      scopedCapabilityId === undefined ||
      scopedInputHash === undefined
    ) {
      return null;
    }
    const [row] = await exec
      .select({
        artifacts: capCache.artifacts,
        resultSummary: capCache.resultSummary,
        jobId: capCache.jobId,
        evidenceIds: jobs.evidenceIds,
      })
      .from(capCache)
      .leftJoin(jobs, eq(capCache.jobId, jobs.id))
      .where(
        and(
          eq(capCache.caseId, scopedCaseId),
          eq(capCache.capabilityId, scopedCapabilityId),
          eq(capCache.inputHash, scopedInputHash),
          gt(capCache.expiresAt, now)
        )
      )
      .limit(1);
    if (!row) return null;
    // Missing Job (left join) or null evidence_ids → []; collect still
    // cache-hits artifacts, landEvidence creates Evidence from those blobs.
    return {
      artifacts: row.artifacts,
      resultSummary: row.resultSummary,
      jobId: row.jobId,
      evidenceIds: row.evidenceIds ?? [],
    };
  },

  async upsert(exec: DbExec, values: UpsertCapCacheValues): Promise<void> {
    const scopedCaseId = trimCaseId(values.caseId);
    const scopedCapabilityId = trimmedOrUndefined(values.capabilityId);
    const scopedInputHash = trimmedOrUndefined(values.inputHash);
    const scopedJobId = trimResourceId(values.jobId);
    if (
      scopedCaseId === undefined ||
      scopedCapabilityId === undefined ||
      scopedInputHash === undefined ||
      scopedJobId === undefined
    ) {
      return;
    }
    const resultSummary = trimmedOrNull(values.resultSummary);
    await exec
      .insert(capCache)
      .values({
        ...values,
        caseId: scopedCaseId,
        capabilityId: scopedCapabilityId,
        inputHash: scopedInputHash,
        jobId: scopedJobId,
        resultSummary,
      })
      .onConflictDoUpdate({
        target: [capCache.caseId, capCache.capabilityId, capCache.inputHash],
        set: {
          jobId: scopedJobId,
          artifacts: values.artifacts,
          resultSummary,
          ttlMs: values.ttlMs,
          createdAt: values.createdAt,
          expiresAt: values.expiresAt,
        },
      });
  },
};
