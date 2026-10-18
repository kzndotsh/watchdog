import { and, desc, eq, getTableColumns, ilike, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { PatchOp } from "@watchdog/schemas/graph";
import {
  type CaseId,
  type ProposalStatus,
  ENTITY_KIND_LABELS,
  ENTITY_KINDS,
  parseGraphUuidList,
} from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { entities } from "../schema/entities";
import { jobs } from "../schema/jobs";
import { playbookRuns } from "../schema/playbook-runs";
import { proposals } from "../schema/proposals";
import { proposalEvidenceIds } from "./_evidence-ids";
import { entitySlugIlikePatterns } from "./_ilike";
import {
  inArrayForDisplayLabelMatch,
  sqlCatalogIdIlike,
} from "./_label-search";
import { clampSearchLimit } from "./_limits";
import {
  trimActorId,
  trimCaseId,
  trimScopedCaseIds,
  resolveNullableGraphIdForWrite,
} from "./_scoped-ids";
import { evidenceLinksRepo } from "./evidence-links.repo";

/** A Proposal with the Evidence ids it cites (from `proposal_evidence`), in citation order. */
export type ProposalRow = typeof proposals.$inferSelect & {
  evidenceIds: string[];
};

const proposalColumns = {
  ...getTableColumns(proposals),
  evidenceIds: proposalEvidenceIds,
} as const;

export type ProposalWithCapability = {
  proposal: ProposalRow;
  capabilityId: string | null;
  playbookId: string | null;
};

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
      | "agentSourced"
      | "userOverridden"
      | "createdBy"
    >
  > & {
    /** Evidence of the same Case the Proposal cites; stored as `proposal_evidence` rows. */
    evidenceIds?: string[];
  };

export const proposalsRepo = {
  async listForCase(
    exec: DbExec,
    caseId: CaseId,
    opts?: { status?: ProposalStatus }
  ): Promise<ProposalWithCapability[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    const rows = await exec
      .select({
        proposal: proposalColumns,
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
    caseId: CaseId,
    term: string,
    limit: number
  ): Promise<ProposalWithCapability[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    const safeLimit = clampSearchLimit(limit);
    const slugPatterns = entitySlugIlikePatterns(term);
    if (slugPatterns.length === 0) return [];
    const pattern = slugPatterns[0];
    // The Case's matching Entity ids, found once for the whole search: an uncorrelated scalar
    // subquery, which Postgres runs as an InitPlan. (Matching inside the per-Proposal EXISTS
    // re-ran the Entity filter, and cast the patch to text, for every Proposal x Entity pair.)
    const matchedEntity = alias(entities, "e");
    const entityKindLabelMatch = inArrayForDisplayLabelMatch(
      matchedEntity.kind,
      ENTITY_KINDS,
      ENTITY_KIND_LABELS,
      term
    );
    const matchedEntityIds = exec
      .select({
        ids: sql<
          string[]
        >`coalesce(array_agg(${matchedEntity.id}::text), '{}'::text[])`,
      })
      .from(matchedEntity)
      .where(
        and(
          eq(matchedEntity.caseId, scopedCaseId),
          or(
            ilike(matchedEntity.name, pattern),
            ...slugPatterns.map((p) => ilike(matchedEntity.slug, p)),
            ilike(matchedEntity.summary, pattern),
            ilike(matchedEntity.notes, pattern),
            ilike(matchedEntity.kind, pattern),
            entityKindLabelMatch
          )
        )
      );
    // The patch as text, once per Proposal row: a lateral `limit 1` subquery, which Postgres
    // cannot inline back into every use of the cast.
    const patchText = sql.raw("proposal_patch_text.patch_text");
    const rows = await exec
      .select({
        proposal: proposalColumns,
        capabilityId: jobs.capabilityId,
        playbookId: playbookRuns.playbookId,
      })
      .from(proposals)
      .crossJoinLateral(
        sql`(select (${proposals.patch})::text as patch_text limit 1) as proposal_patch_text`
      )
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
            sql`${patchText} ilike ${pattern}`,
            sql`exists (
              select 1 from unnest(${matchedEntityIds}) as m(id)
              where strpos(${patchText}, m.id) > 0
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
    caseId: CaseId,
    proposalId: string
  ): Promise<ProposalWithCapability | null> {
    const scoped = trimScopedCaseIds(caseId, proposalId);
    if (!scoped) return null;
    const [row] = await exec
      .select({
        proposal: proposalColumns,
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
    caseId: CaseId,
    proposalId: string
  ): Promise<ProposalRow | null> {
    const scoped = trimScopedCaseIds(caseId, proposalId);
    if (!scoped) return null;
    const [row] = await exec
      .select(proposalColumns)
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
    caseId: CaseId
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
    const { evidenceIds: _evidenceIds, ...columns } = values;
    const [created] = await exec
      .insert(proposals)
      .values({
        ...columns,
        caseId: scopedCaseId,
        jobId,
        ...(values.createdBy === undefined
          ? {}
          : { createdBy: createdBy ?? null }),
        agentSourced: values.agentSourced ?? false,
        userOverridden: values.userOverridden ?? false,
      })
      .returning({ id: proposals.id });
    if (created === undefined) return null;
    if (evidenceIdsParsed.length > 0) {
      await evidenceLinksRepo.linkProposal(
        exec,
        scopedCaseId,
        created.id,
        evidenceIdsParsed
      );
    }
    return created;
  },

  async accept(
    exec: DbExec,
    caseId: CaseId,
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
      .returning(proposalColumns);
    return updated ?? null;
  },

  async reject(
    exec: DbExec,
    caseId: CaseId,
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
        rejectReason: values.rejectReason,
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
      .returning(proposalColumns);
    return updated ?? null;
  },
};
