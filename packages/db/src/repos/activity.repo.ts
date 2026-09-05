import { and, desc, eq, isNull } from "drizzle-orm";

import type { JobStatus } from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { cases } from "../schema/cases";
import { evidence } from "../schema/evidence";
import { jobs } from "../schema/jobs";
import { proposals } from "../schema/proposals";

export interface RecentActivityOpts {
  organizationId: string;
  caseId?: string;
  limit: number;
}

export interface RecentEvidenceActivityRow {
  id: string;
  caseId: string;
  caseName: string;
  kind: string;
  label: string | null;
  actorId: string;
  actorLabel: string | null;
  at: Date;
}

export interface RecentJobActivityRow {
  id: string;
  caseId: string;
  caseName: string;
  capabilityId: string;
  status: JobStatus;
  resultSummary: string | null;
  actorId: string;
  actorLabel: string | null;
  at: Date;
}

export interface RecentProposalActivityRow {
  id: string;
  caseId: string;
  caseName: string;
  summary: string | null;
  at: Date;
}

function orgCaseFilter(organizationId: string, caseId: string | undefined) {
  return and(
    eq(cases.organizationId, organizationId),
    caseId === undefined ? undefined : eq(cases.id, caseId)
  );
}

export const activityRepo = {
  async recentEvidence(
    exec: DbExec,
    opts: RecentActivityOpts
  ): Promise<RecentEvidenceActivityRow[]> {
    return exec
      .select({
        id: evidence.id,
        caseId: evidence.caseId,
        caseName: cases.name,
        kind: evidence.kind,
        label: evidence.label,
        actorId: evidence.actorId,
        actorLabel: evidence.actorLabel,
        at: evidence.capturedAt,
      })
      .from(evidence)
      .innerJoin(cases, eq(cases.id, evidence.caseId))
      .where(
        and(
          isNull(evidence.deletedAt),
          orgCaseFilter(opts.organizationId, opts.caseId)
        )
      )
      .orderBy(desc(evidence.capturedAt))
      .limit(opts.limit);
  },

  async recentJobs(
    exec: DbExec,
    opts: RecentActivityOpts
  ): Promise<RecentJobActivityRow[]> {
    return exec
      .select({
        id: jobs.id,
        caseId: jobs.caseId,
        caseName: cases.name,
        capabilityId: jobs.capabilityId,
        status: jobs.status,
        resultSummary: jobs.resultSummary,
        actorId: jobs.actorId,
        actorLabel: jobs.actorLabel,
        at: jobs.updatedAt,
      })
      .from(jobs)
      .innerJoin(cases, eq(cases.id, jobs.caseId))
      .where(orgCaseFilter(opts.organizationId, opts.caseId))
      .orderBy(desc(jobs.updatedAt))
      .limit(opts.limit);
  },

  async recentPendingProposals(
    exec: DbExec,
    opts: RecentActivityOpts
  ): Promise<RecentProposalActivityRow[]> {
    return exec
      .select({
        id: proposals.id,
        caseId: proposals.caseId,
        caseName: cases.name,
        summary: proposals.summary,
        at: proposals.createdAt,
      })
      .from(proposals)
      .innerJoin(cases, eq(cases.id, proposals.caseId))
      .where(
        and(
          eq(proposals.status, "pending"),
          orgCaseFilter(opts.organizationId, opts.caseId)
        )
      )
      .orderBy(desc(proposals.createdAt))
      .limit(opts.limit);
  },
};
