import { sql } from "drizzle-orm";

import type {
  CaseId,
  JobStatus,
  PlaybookRunOutcome,
  PlaybookRunStatus,
} from "@watchdog/schemas/shared";

import { collectQueue, collectQueueMember } from "../schema/collect-queue";
import { jobEvidence } from "../schema/evidence-links";
import { jobs } from "../schema/jobs";
import { playbookRuns } from "../schema/playbook-runs";
import { jobEvidenceIds } from "./_evidence-ids";
import type { JobListRow } from "./_job-shapes";

/*
 * Collect's page read (#574, `collectListRepo`): one statement returns each queue row with its
 * member Jobs and its Evidence, so a row's state, its Jobs and its Evidence come from ONE
 * snapshot. The projection is written in the same commit as the source change, so the statement
 * sees both or neither; two statements could see a Job the row does not hold yet. Raw `sql` here
 * by necessity (a correlated `json_agg` the builder cannot express), outside `*.repo.ts`, like
 * `_evidence-ids.ts`.
 */

/** A member Job as the page statement returns it: `jobListColumns` and its run, times as ISO text. */
export type CollectMemberJson = {
  id: string;
  caseId: CaseId;
  capabilityId: string;
  input: JobListRow["input"];
  output: JobListRow["output"];
  status: JobStatus;
  error: string | null;
  interpretError: string | null;
  proposalId: string | null;
  evidenceIds: string[];
  resultSummary: string | null;
  fromCache: boolean;
  suppressedCount: number;
  actorId: string;
  actorLabel: string;
  playbookRunId: string | null;
  playbookStep: number | null;
  playbookFanIndex: number;
  retryOfJobId: string | null;
  playbookId: string | null;
  playbookRunStatus: PlaybookRunStatus | null;
  playbookRunOutcome: PlaybookRunOutcome | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

/** The row's member Jobs, oldest first, each with its Evidence ids and its run's playbook. */
export const collectMembers = sql<CollectMemberJson[]>`coalesce((
  select jsonb_agg(jsonb_build_object(
    'id', ${jobs.id},
    'caseId', ${jobs.caseId},
    'capabilityId', ${jobs.capabilityId},
    'input', ${jobs.input},
    'output', ${jobs.output},
    'status', ${jobs.status},
    'error', ${jobs.error},
    'interpretError', ${jobs.interpretError},
    'proposalId', ${jobs.proposalId},
    'evidenceIds', ${jobEvidenceIds},
    'resultSummary', ${jobs.resultSummary},
    'fromCache', ${jobs.fromCache},
    'suppressedCount', ${jobs.suppressedCount},
    'actorId', ${jobs.actorId},
    'actorLabel', ${jobs.actorLabel},
    'playbookRunId', ${jobs.playbookRunId},
    'playbookStep', ${jobs.playbookStep},
    'playbookFanIndex', ${jobs.playbookFanIndex},
    'retryOfJobId', ${jobs.retryOfJobId},
    'playbookId', ${playbookRuns.playbookId},
    'playbookRunStatus', ${playbookRuns.status},
    'playbookRunOutcome', ${playbookRuns.outcome},
    'createdAt', ${jobs.createdAt},
    'updatedAt', ${jobs.updatedAt},
    'startedAt', ${jobs.startedAt},
    'finishedAt', ${jobs.finishedAt}
  ) order by ${jobs.createdAt}, ${jobs.id})
  from ${collectQueueMember}
  join ${jobs} on ${jobs.id} = ${collectQueueMember.jobId}
  left join ${playbookRuns} on ${playbookRuns.id} = ${jobs.playbookRunId}
  where ${collectQueueMember.rowId} = ${collectQueue.id}
), '[]'::jsonb)`;

/** True when the member Job landed the row's own Evidence (the row `locate` prefers for a Job). */
export const memberLandedRow = sql<boolean>`exists (
  select 1 from ${jobEvidence}
  where ${jobEvidence.jobId} = ${collectQueueMember.jobId}
    and ${jobEvidence.evidenceId} = ${collectQueueMember.rowId}
)`;
