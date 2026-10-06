import { Effect } from "effect";

import type { DbExec } from "@watchdog/db";
import { ACTIVITY_ENTRY_ACTIONS } from "@watchdog/schemas/feed";
import type { CaseId, JobStatus } from "@watchdog/schemas/shared";

import { appendActivityEffect } from "../activity/append";
import type { DomainTag } from "../infra/tagged-errors";

/** The Job fields an activity entry is derived from. */
export interface JobActivitySubject {
  id: string;
  caseId: CaseId;
  actorId: string;
  actorLabel: string | null;
  /** The playbook run: the entry's `group_id`, so the feed collapses step Jobs. */
  playbookRunId: string | null;
}

type JobActivityAction = (typeof ACTIVITY_ENTRY_ACTIONS.job)[number];
const JOB_ACTIONS = ACTIVITY_ENTRY_ACTIONS.job;

/**
 * The log verb for a Job status, or `null` when the status has none: the log
 * records queued, running and the three terminal states. `blocked` is a
 * legacy status that no write path produces any more.
 */
export function jobActivityActionForStatus(
  status: JobStatus
): JobActivityAction | null {
  return JOB_ACTIONS.find((action) => action === status) ?? null;
}

/**
 * Append the entry for a Job entering `status` (ADR-0005 S2). Call it on the
 * transaction that writes the status, so the entry exists exactly when the
 * write committed. The label stays `null`: Recent activity resolves Job labels
 * on read from `subject_id`. The actor is the Job's own, as the feed showed
 * before the log.
 */
export function appendJobActivityEffect(
  tx: DbExec,
  job: JobActivitySubject,
  status: JobStatus
): Effect.Effect<void, DomainTag> {
  const action = jobActivityActionForStatus(status);
  if (action === null) return Effect.void;
  return appendActivityEffect(tx, {
    caseId: job.caseId,
    kind: "job",
    action,
    subjectId: job.id,
    groupId: job.playbookRunId,
    actorId: job.actorId,
    actorLabel: job.actorLabel,
    toValue: status,
  }).pipe(Effect.asVoid);
}
