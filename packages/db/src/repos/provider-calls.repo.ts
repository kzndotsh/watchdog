import { and, asc, eq, inArray } from "drizzle-orm";

import { normalizeUuidList, type CaseId } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
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

/** A call with how it ended; `outcome` is null while it is in flight or after a crash. */
export type ProviderCallWithOutcome = {
  call: ProviderCallRow;
  outcome: ProviderCallOutcomeRow | null;
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

  /** A Job's calls in the order they began, each with its outcome when it has one. */
  async listForJob(
    exec: DbExec,
    caseId: CaseId,
    jobId: string
  ): Promise<ProviderCallWithOutcome[]> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedJobId = trimResourceId(jobId);
    if (scopedCaseId === undefined || scopedJobId === undefined) return [];
    return exec
      .select({ call: providerCalls, outcome: providerCallOutcomes })
      .from(providerCalls)
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

  /** The calls behind one Evidence row, with their outcomes, oldest first. */
  async listForEvidence(
    exec: DbExec,
    caseId: CaseId,
    evidenceId: string
  ): Promise<ProviderCallWithOutcome[]> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedEvidenceId = trimResourceId(evidenceId);
    if (scopedCaseId === undefined || scopedEvidenceId === undefined) return [];
    return exec
      .select({ call: providerCalls, outcome: providerCallOutcomes })
      .from(evidenceProviderCalls)
      .innerJoin(
        providerCalls,
        eq(providerCalls.id, evidenceProviderCalls.callId)
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
