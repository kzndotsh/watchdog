import { and, asc, eq, exists, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { normalizeUuidList, type CaseId } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { jobEvidence } from "../schema/evidence-links";
import { jobs } from "../schema/jobs";
import {
  evidenceProviderCalls,
  providerCallOutcomes,
  providerCalls,
} from "../schema/provider-calls";
import { trimCaseId, trimResourceId } from "./_scoped-ids";

export type ProviderCallRow = typeof providerCalls.$inferSelect;
export type ProviderCallOutcomeRow = typeof providerCallOutcomes.$inferSelect;
export type NewProviderCall = typeof providerCalls.$inferInsert;
export type NewProviderCallOutcome = typeof providerCallOutcomes.$inferInsert;

/** The Job a call belongs to: which Cap and version made it, and whether its record is whole. */
export type ProviderCallJob = Pick<
  typeof jobs.$inferSelect,
  "id" | "capabilityId" | "capVersion" | "provenanceState"
>;

/**
 * A call with how it ended and the Job that made it; `outcome` is null while it is in flight or
 * after a crash.
 */
export type ProviderCallWithOutcome = {
  call: ProviderCallRow;
  outcome: ProviderCallOutcomeRow | null;
  job: ProviderCallJob;
};

const jobColumns = {
  id: jobs.id,
  capabilityId: jobs.capabilityId,
  capVersion: jobs.capVersion,
  provenanceState: jobs.provenanceState,
};

/**
 * Provider calls (#495): the request side (`provider_calls`), how each ended
 * (`provider_call_outcomes`) and the link to the Evidence they produced
 * (`evidence_provider_calls`). All three are append-only by privilege (`AUDIT_TABLES`): the
 * application role holds INSERT and SELECT, so this repo has no method that changes or removes a
 * row. Every insert is idempotent (`ON CONFLICT DO NOTHING`), so a repeated save is a no-op.
 */
export const providerCallsRepo = {
  /** Write-ahead: the request side, before the call is sent. True when the row was new. */
  async insertRequest(exec: DbExec, values: NewProviderCall): Promise<boolean> {
    const rows = await exec
      .insert(providerCalls)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: providerCalls.id });
    return rows.length > 0;
  },

  /** How the call ended. True when the row was new. */
  async insertOutcome(
    exec: DbExec,
    values: NewProviderCallOutcome
  ): Promise<boolean> {
    const rows = await exec
      .insert(providerCallOutcomes)
      .values(values)
      .onConflictDoNothing()
      .returning({ callId: providerCallOutcomes.callId });
    return rows.length > 0;
  },

  /**
   * A Job's calls in the order they began, each with its outcome when it has one. `limit` caps
   * the rows (a read surface passes one more than it shows, to know the list was cut).
   */
  async listForJob(
    exec: DbExec,
    caseId: CaseId,
    jobId: string,
    limit?: number
  ): Promise<ProviderCallWithOutcome[]> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedJobId = trimResourceId(jobId);
    if (scopedCaseId === undefined || scopedJobId === undefined) return [];
    const query = exec
      .select({
        call: providerCalls,
        outcome: providerCallOutcomes,
        job: jobColumns,
      })
      .from(providerCalls)
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, providerCalls.jobId),
          eq(jobs.caseId, providerCalls.caseId)
        )
      )
      .leftJoin(
        providerCallOutcomes,
        eq(providerCallOutcomes.callId, providerCalls.id)
      )
      .where(
        and(
          eq(providerCalls.caseId, scopedCaseId),
          eq(providerCalls.jobId, scopedJobId)
        )
      )
      .orderBy(asc(providerCalls.startedAt), asc(providerCalls.seq));
    return limit === undefined ? query : query.limit(limit);
  },

  /**
   * One call with its outcome, only when it belongs to the Case. A call of another Case reads as
   * missing, so an id that names one elsewhere is indistinguishable from an id that names none.
   */
  async getInCase(
    exec: DbExec,
    caseId: CaseId,
    callId: string
  ): Promise<ProviderCallWithOutcome | null> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedCallId = trimResourceId(callId);
    if (scopedCaseId === undefined || scopedCallId === undefined) return null;
    const [row] = await exec
      .select({
        call: providerCalls,
        outcome: providerCallOutcomes,
        job: jobColumns,
      })
      .from(providerCalls)
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, providerCalls.jobId),
          eq(jobs.caseId, providerCalls.caseId)
        )
      )
      .leftJoin(
        providerCallOutcomes,
        eq(providerCallOutcomes.callId, providerCalls.id)
      )
      .where(
        and(
          eq(providerCalls.caseId, scopedCaseId),
          eq(providerCalls.id, scopedCallId)
        )
      )
      .limit(1);
    return row ?? null;
  },

  /**
   * Which of these call ids are calls of the Case, with the Job each belongs to. An id that names
   * a call of another Case, or none, is absent from the answer: this is how a soft reference
   * (`served_from_call_id`) is followed only inside the caller's Case.
   */
  async findIdsInCase(
    exec: DbExec,
    caseId: CaseId,
    callIds: readonly string[]
  ): Promise<{ id: string; jobId: string }[]> {
    const scopedCaseId = trimCaseId(caseId);
    const ids = normalizeUuidList([...callIds]);
    if (scopedCaseId === undefined || ids.length === 0) return [];
    return exec
      .select({ id: providerCalls.id, jobId: providerCalls.jobId })
      .from(providerCalls)
      .where(
        and(
          eq(providerCalls.caseId, scopedCaseId),
          inArray(providerCalls.id, ids)
        )
      );
  },

  /**
   * The Jobs that answered from a cache and their source Job, for one Job or for the Jobs whose
   * result became one piece of Evidence. The source is `jobs.cache_source_job_id`, a soft
   * reference that can name a Job of another Case or organization (the feed caches are shared by
   * the process), so it is joined only to a Job of this Case: outside it `sourceJobId` is null and
   * nothing else about that row is read.
   */
  async listCacheHits(
    exec: DbExec,
    caseId: CaseId,
    of: { jobId: string } | { evidenceId: string }
  ): Promise<{ jobId: string; sourceJobId: string | null }[]> {
    const scopedCaseId = trimCaseId(caseId);
    const jobId = "jobId" in of ? trimResourceId(of.jobId) : undefined;
    const evidenceId =
      "evidenceId" in of ? trimResourceId(of.evidenceId) : undefined;
    if (
      scopedCaseId === undefined ||
      (jobId === undefined && evidenceId === undefined)
    ) {
      return [];
    }
    const source = alias(jobs, "cache_source");
    const base = exec
      .select({ jobId: jobs.id, sourceJobId: source.id })
      .from(jobs)
      .leftJoin(
        source,
        and(
          eq(source.id, jobs.cacheSourceJobId),
          eq(source.caseId, scopedCaseId)
        )
      );
    const inCase = and(eq(jobs.caseId, scopedCaseId), eq(jobs.fromCache, true));
    if (jobId !== undefined) {
      return base.where(and(inCase, eq(jobs.id, jobId)));
    }
    return base
      .innerJoin(
        jobEvidence,
        and(
          eq(jobEvidence.jobId, jobs.id),
          eq(jobEvidence.caseId, scopedCaseId)
        )
      )
      .where(and(inCase, eq(jobEvidence.evidenceId, evidenceId ?? "")))
      .orderBy(asc(jobs.createdAt));
  },

  /**
   * Whether the record behind a piece of Evidence has a gap: a Job that produced it, or made one
   * of its calls, is marked `incomplete`. Both ends are read in the Case.
   */
  async evidenceHasIncompleteProvenance(
    exec: DbExec,
    caseId: CaseId,
    evidenceId: string
  ): Promise<boolean> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedEvidenceId = trimResourceId(evidenceId);
    if (scopedCaseId === undefined || scopedEvidenceId === undefined) {
      return false;
    }
    const [row] = await exec
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.caseId, scopedCaseId),
          eq(jobs.provenanceState, "incomplete"),
          or(
            exists(
              exec
                .select({ one: jobEvidence.jobId })
                .from(jobEvidence)
                .where(
                  and(
                    eq(jobEvidence.jobId, jobs.id),
                    eq(jobEvidence.caseId, scopedCaseId),
                    eq(jobEvidence.evidenceId, scopedEvidenceId)
                  )
                )
            ),
            exists(
              exec
                .select({ one: providerCalls.id })
                .from(providerCalls)
                .innerJoin(
                  evidenceProviderCalls,
                  eq(evidenceProviderCalls.callId, providerCalls.id)
                )
                .where(
                  and(
                    eq(providerCalls.jobId, jobs.id),
                    eq(evidenceProviderCalls.caseId, scopedCaseId),
                    eq(evidenceProviderCalls.evidenceId, scopedEvidenceId)
                  )
                )
            )
          )
        )
      )
      .limit(1);
    return row !== undefined;
  },

  /** Ids of the calls a Job made, oldest first, for linking Evidence to a cache's source run. */
  async listIdsForJob(
    exec: DbExec,
    caseId: CaseId,
    jobId: string
  ): Promise<string[]> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedJobId = trimResourceId(jobId);
    if (scopedCaseId === undefined || scopedJobId === undefined) return [];
    const rows = await exec
      .select({ id: providerCalls.id })
      .from(providerCalls)
      .where(
        and(
          eq(providerCalls.caseId, scopedCaseId),
          eq(providerCalls.jobId, scopedJobId)
        )
      )
      .orderBy(asc(providerCalls.startedAt), asc(providerCalls.seq));
    return rows.map((row) => row.id);
  },

  /**
   * Link each Evidence row to each call, in the Evidence's Case. A pair already linked is left
   * alone. The composite keys refuse a call or Evidence of another Case.
   */
  async linkEvidence(
    exec: DbExec,
    caseId: CaseId,
    evidenceIds: readonly string[],
    callIds: readonly string[]
  ): Promise<number> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return 0;
    const evidence = normalizeUuidList([...evidenceIds]);
    const calls = normalizeUuidList([...callIds]);
    if (evidence.length === 0 || calls.length === 0) return 0;
    const values = evidence.flatMap((evidenceId) =>
      calls.map((callId) => ({ evidenceId, callId, caseId: scopedCaseId }))
    );
    const rows = await exec
      .insert(evidenceProviderCalls)
      .values(values)
      .onConflictDoNothing()
      .returning({ callId: evidenceProviderCalls.callId });
    return rows.length;
  },

  /** The calls behind one Evidence row, with their outcomes, oldest first; `limit` as `listForJob`. */
  async listForEvidence(
    exec: DbExec,
    caseId: CaseId,
    evidenceId: string,
    limit?: number
  ): Promise<ProviderCallWithOutcome[]> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedEvidenceId = trimResourceId(evidenceId);
    if (scopedCaseId === undefined || scopedEvidenceId === undefined) return [];
    const query = exec
      .select({
        call: providerCalls,
        outcome: providerCallOutcomes,
        job: jobColumns,
      })
      .from(evidenceProviderCalls)
      .innerJoin(
        providerCalls,
        eq(providerCalls.id, evidenceProviderCalls.callId)
      )
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, providerCalls.jobId),
          eq(jobs.caseId, providerCalls.caseId)
        )
      )
      .leftJoin(
        providerCallOutcomes,
        eq(providerCallOutcomes.callId, providerCalls.id)
      )
      .where(
        and(
          eq(evidenceProviderCalls.caseId, scopedCaseId),
          eq(evidenceProviderCalls.evidenceId, scopedEvidenceId)
        )
      )
      .orderBy(asc(providerCalls.startedAt), asc(providerCalls.seq));
    return limit === undefined ? query : query.limit(limit);
  },

  /** Which of these calls have an outcome row. Core uses it to tell a whole record from a gap. */
  async listIdsWithOutcome(
    exec: DbExec,
    caseId: CaseId,
    callIds: readonly string[]
  ): Promise<string[]> {
    const scopedCaseId = trimCaseId(caseId);
    const ids = normalizeUuidList([...callIds]);
    if (scopedCaseId === undefined || ids.length === 0) return [];
    const rows = await exec
      .select({ id: providerCallOutcomes.callId })
      .from(providerCallOutcomes)
      .where(
        and(
          eq(providerCallOutcomes.caseId, scopedCaseId),
          inArray(providerCallOutcomes.callId, ids)
        )
      );
    return rows.map((row) => row.id);
  },
};
