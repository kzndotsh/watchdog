import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import type { PatchOp, ProposalStatus } from "@watchdog/schemas";
import {
  ENTITY_KIND_LABELS,
  ENTITY_KINDS,
  parseGraphUuidList,
  trimmedOrNull,
} from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { entities } from "../schema/entities";
import { jobs } from "../schema/jobs";
import { playbookRuns } from "../schema/playbook-runs";
import { proposals } from "../schema/proposals";
import { entitySlugIlikePatterns } from "./_ilike";
import { sqlCatalogIdIlike, sqlInDisplayLabelMatch } from "./_label-search";
import { clampSearchLimit } from "./_limits";
import {
  trimActorId,
  trimCaseId,
  trimScopedCaseIds,
  resolveNullableGraphIdForWrite,
} from "./_scoped-ids";

export type ProposalRow = typeof proposals.$inferSelect;

export interface ProposalWithCapability {
  proposal: ProposalRow;
  capabilityId: string | null;
  playbookId: string | null;
}

export type NewProposal = Pick<
  typeof proposals.$inferInsert,
  "caseId" | "status" | "patch"
> &
  Partial<
    Pick<
      typeof proposals.$inferInsert,
      | "jobId"
      | "summary"
      | "suppressedCount"
      | "evidenceIds"
      | "agentSourced"
      | "userOverridden"
      | "createdBy"
    >
  >;

export const proposalsRepo = {
  async listForCase(
    exec: DbExec,
    caseId: string,
    opts?: { status?: ProposalStatus }
  ): Promise<ProposalWithCapability[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    const rows = await exec
      .select({
        proposal: proposals,
        capabilityId: jobs.capabilityId,
        playbookId: playbookRuns.playbookId,
      })
      .from(proposals)
      .leftJoin(jobs, eq(proposals.jobId, jobs.id))
      .leftJoin(playbookRuns, eq(jobs.playbookRunId, playbookRuns.id))
      .where(
        and(
          eq(proposals.caseId, scopedCaseId),
          opts?.status ? eq(proposals.status, opts.status) : undefined
        )
      )
      .orderBy(desc(proposals.createdAt));
    return rows.map((r) => ({
      proposal: r.proposal,
      capabilityId: r.capabilityId ?? null,
      playbookId: r.playbookId ?? null,
    }));
  },

  /** Pending proposals matching summary, linked cap id, or patch text. */
  async searchPendingForCase(
    exec: DbExec,
    caseId: string,
    term: string,
    limit: number
  ): Promise<ProposalWithCapability[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    const safeLimit = clampSearchLimit(limit);
    const slugPatterns = entitySlugIlikePatterns(term);
    if (slugPatterns.length === 0) return [];
    const pattern = slugPatterns[0];
    const entityKindLabelMatch = sqlInDisplayLabelMatch(
      "e.kind",
      ENTITY_KINDS,
      ENTITY_KIND_LABELS,
      term
    );
    const entityFieldMatches = [
      sql`e.name ilike ${pattern}`,
      ...slugPatterns.map((p) => sql`e.slug ilike ${p}`),
      sql`e.summary ilike ${pattern}`,
      sql`e.notes ilike ${pattern}`,
      sql`e.kind::text ilike ${pattern}`,
      ...(entityKindLabelMatch ? [entityKindLabelMatch] : []),
    ];
    const rows = await exec
      .select({
        proposal: proposals,
        capabilityId: jobs.capabilityId,
        playbookId: playbookRuns.playbookId,
      })
      .from(proposals)
      .leftJoin(jobs, eq(proposals.jobId, jobs.id))
      .leftJoin(playbookRuns, eq(jobs.playbookRunId, playbookRuns.id))
      .where(
        and(
          eq(proposals.caseId, scopedCaseId),
          eq(proposals.status, "pending"),
          or(
            ilike(proposals.summary, pattern),
            sqlCatalogIdIlike("jobs.capability_id", pattern),
            sqlCatalogIdIlike("playbook_runs.playbook_id", pattern),
            sql`(${proposals.patch})::text ilike ${pattern}`,
            sql`exists (
              select 1 from ${entities} e
              where e.case_id = ${proposals.caseId}
              and (${sql.join(entityFieldMatches, sql` or `)})
              and (${proposals.patch})::text like '%' || e.id::text || '%'
            )`
          )
        )
      )
      .orderBy(desc(proposals.createdAt))
      .limit(safeLimit);
    return rows.map((r) => ({
      proposal: r.proposal,
      capabilityId: r.capabilityId ?? null,
      playbookId: r.playbookId ?? null,
    }));
  },

  async getInCase(
    exec: DbExec,
    caseId: string,
    proposalId: string
  ): Promise<ProposalWithCapability | null> {
    const scoped = trimScopedCaseIds(caseId, proposalId);
    if (!scoped) return null;
    const [row] = await exec
      .select({
        proposal: proposals,
        capabilityId: jobs.capabilityId,
        playbookId: playbookRuns.playbookId,
      })
      .from(proposals)
      .leftJoin(jobs, eq(proposals.jobId, jobs.id))
      .leftJoin(playbookRuns, eq(jobs.playbookRunId, playbookRuns.id))
      .where(
        and(
          eq(proposals.caseId, scoped.caseId),
          eq(proposals.id, scoped.resourceId)
        )
      )
      .limit(1);
    if (!row) return null;
    return {
      proposal: row.proposal,
      capabilityId: row.capabilityId ?? null,
      playbookId: row.playbookId ?? null,
    };
  },

  /** Row lock for Accept/Reject — joins none so FOR UPDATE is not on a nullable side. */
  async lockInCase(
    exec: DbExec,
    caseId: string,
    proposalId: string
  ): Promise<ProposalRow | null> {
    const scoped = trimScopedCaseIds(caseId, proposalId);
    if (!scoped) return null;
    const [row] = await exec
      .select()
      .from(proposals)
      .where(
        and(
          eq(proposals.caseId, scoped.caseId),
          eq(proposals.id, scoped.resourceId)
        )
      )
      .limit(1)
      .for("update");
    return row ?? null;
  },

  async listPendingPatches(
    exec: DbExec,
    caseId: string
  ): Promise<{ patch: PatchOp[] }[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    return exec
      .select({ patch: proposals.patch })
      .from(proposals)
      .where(
        and(eq(proposals.caseId, scopedCaseId), eq(proposals.status, "pending"))
      );
  },

  async create(
    exec: DbExec,
    values: NewProposal
  ): Promise<{ id: string } | null> {
    const scopedCaseId = trimCaseId(values.caseId);
    if (scopedCaseId === undefined) return null;
    let jobId: string | null | undefined;
    if (values.jobId === undefined) {
      jobId = undefined;
    } else {
      const resolved = resolveNullableGraphIdForWrite(values.jobId);
      if (!resolved.ok) return null;
      jobId = resolved.id ?? null;
    }
    const summary =
      values.summary === undefined
        ? values.summary
        : trimmedOrNull(values.summary);
    const createdBy =
      values.createdBy === undefined || values.createdBy === null
        ? values.createdBy
        : trimActorId(values.createdBy);
    if (
      createdBy === undefined &&
      values.createdBy !== undefined &&
      values.createdBy !== null
    ) {
      return null;
    }
    const evidenceIdsParsed = parseGraphUuidList(values.evidenceIds ?? []);
    if (evidenceIdsParsed === null) {
      return null;
    }
    const [created] = await exec
      .insert(proposals)
      .values({
        ...values,
        caseId: scopedCaseId,
        jobId,
        summary,
        ...(values.createdBy === undefined
          ? {}
          : { createdBy: createdBy ?? null }),
        evidenceIds: evidenceIdsParsed,
        agentSourced: values.agentSourced ?? false,
        userOverridden: values.userOverridden ?? false,
      })
      .returning({ id: proposals.id });
    return created ?? null;
  },

  async accept(
    exec: DbExec,
    caseId: string,
    proposalId: string,
    values: { decidedBy: string; decidedAt: Date }
  ): Promise<ProposalRow | null> {
    const scoped = trimScopedCaseIds(caseId, proposalId);
    if (!scoped) return null;
    const scopedDecidedBy = trimActorId(values.decidedBy);
    if (scopedDecidedBy === undefined) return null;
    const [updated] = await exec
      .update(proposals)
      .set({
        status: "accepted",
        decidedBy: scopedDecidedBy,
        decidedAt: values.decidedAt,
      })
      .where(
        and(
          eq(proposals.id, scoped.resourceId),
          eq(proposals.caseId, scoped.caseId),
          eq(proposals.status, "pending")
        )
      )
      .returning();
    return updated ?? null;
  },

  async reject(
    exec: DbExec,
    caseId: string,
    proposalId: string,
    values: {
      rejectReason: string | null;
      decidedBy: string;
      decidedAt: Date;
    }
  ): Promise<ProposalRow | null> {
    const scoped = trimScopedCaseIds(caseId, proposalId);
    if (!scoped) return null;
    const scopedDecidedBy = trimActorId(values.decidedBy);
    if (scopedDecidedBy === undefined) return null;
    const [updated] = await exec
      .update(proposals)
      .set({
        status: "rejected",
        rejectReason: trimmedOrNull(values.rejectReason),
        decidedBy: scopedDecidedBy,
        decidedAt: values.decidedAt,
      })
      .where(
        and(
          eq(proposals.id, scoped.resourceId),
          eq(proposals.caseId, scoped.caseId),
          eq(proposals.status, "pending")
        )
      )
      .returning();
    return updated ?? null;
  },
};
