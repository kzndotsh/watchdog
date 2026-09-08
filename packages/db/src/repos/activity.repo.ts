import { and, desc, eq, isNull } from "drizzle-orm";

import type {
  JobStatus,
  JsonObject,
  PatchOp,
  EvidenceKind,
} from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { cases } from "../schema/cases";
import { evidence } from "../schema/evidence";
import { jobs } from "../schema/jobs";
import { playbookRuns } from "../schema/playbook-runs";
import { proposals } from "../schema/proposals";
import { clampSearchLimit } from "./_limits";
import { orgCaseFilter } from "./_org-case-filter";

export interface RecentActivityOpts {
  organizationId: string;
  caseId?: string;
  limit: number;
}

export interface RecentEvidenceActivityRow {
  id: string;
  caseId: string;
  caseName: string;
  kind: EvidenceKind;
  label: string | null;
  sourceUrl: string | null;
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
  input: JsonObject;
  playbookRunId: string | null;
  playbookStep: number | null;
  playbookId: string | null;
  actorId: string;
  actorLabel: string | null;
  at: Date;
}

export interface RecentProposalActivityRow {
  id: string;
  caseId: string;
  caseName: string;
  summary: string | null;
  capabilityId: string | null;
  playbookId: string | null;
  patch: PatchOp[];
  at: Date;
}

export const activityRepo = {
  async recentEvidence(
    exec: DbExec,
    opts: RecentActivityOpts
  ): Promise<RecentEvidenceActivityRow[]> {
    const safeLimit = clampSearchLimit(opts.limit);
    return exec
      .select({
        id: evidence.id,
        caseId: evidence.caseId,
        caseName: cases.name,
        kind: evidence.kind,
        label: evidence.label,
        sourceUrl: evidence.sourceUrl,
        actorId: evidence.actorId,
        actorLabel: evidence.actorLabel,
        at: evidence.capturedAt,
      })
      .from(evidence)
      .innerJoin(cases, eq(cases.id, evidence.caseId))
      .where(
        and(
          isNull(evidence.deletedAt),
          orgCaseFilter(opts.organizationId, opts.caseId, cases.id)
        )
      )
      .orderBy(desc(evidence.capturedAt))
      .limit(safeLimit);
  },

  async recentJobs(
    exec: DbExec,
    opts: RecentActivityOpts
  ): Promise<RecentJobActivityRow[]> {
    const safeLimit = clampSearchLimit(opts.limit);
    return exec
      .select({
        id: jobs.id,
        caseId: jobs.caseId,
        caseName: cases.name,
        capabilityId: jobs.capabilityId,
        status: jobs.status,
        resultSummary: jobs.resultSummary,
        input: jobs.input,
        playbookRunId: jobs.playbookRunId,
        playbookStep: jobs.playbookStep,
        playbookId: playbookRuns.playbookId,
        actorId: jobs.actorId,
        actorLabel: jobs.actorLabel,
        at: jobs.updatedAt,
      })
      .from(jobs)
      .innerJoin(cases, eq(cases.id, jobs.caseId))
      .leftJoin(playbookRuns, eq(jobs.playbookRunId, playbookRuns.id))
      .where(orgCaseFilter(opts.organizationId, opts.caseId, cases.id))
      .orderBy(desc(jobs.updatedAt))
      .limit(safeLimit);
  },

  async recentPendingProposals(
    exec: DbExec,
    opts: RecentActivityOpts
  ): Promise<RecentProposalActivityRow[]> {
    const safeLimit = clampSearchLimit(opts.limit);
    return exec
      .select({
        id: proposals.id,
        caseId: proposals.caseId,
        caseName: cases.name,
        summary: proposals.summary,
        capabilityId: jobs.capabilityId,
        playbookId: playbookRuns.playbookId,
        patch: proposals.patch,
        at: proposals.createdAt,
      })
      .from(proposals)
      .innerJoin(cases, eq(cases.id, proposals.caseId))
      .leftJoin(jobs, eq(proposals.jobId, jobs.id))
      .leftJoin(playbookRuns, eq(jobs.playbookRunId, playbookRuns.id))
      .where(
        and(
          eq(proposals.status, "pending"),
          orgCaseFilter(opts.organizationId, opts.caseId, cases.id)
        )
      )
      .orderBy(desc(proposals.createdAt))
      .limit(safeLimit);
  },
};
