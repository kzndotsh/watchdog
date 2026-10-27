import { eq } from "drizzle-orm";

import {
  activityLogRepo,
  jobs,
  jobsRepo,
  type DbExec,
  type JobPatch,
  type JobRow,
  type NewJob,
} from "@watchdog/db";
import { ACTIVITY_ENTRY_ACTIONS } from "@watchdog/schemas/feed";
import type { CaseId, JobStatus } from "@watchdog/schemas/shared";
import { TEST_ACTOR_ID } from "@watchdog/test-kit/fixtures";

import { flushCollectQueue } from "../collect-queue";

type SeedJobOverrides = Partial<NewJob> &
  Partial<Pick<JobPatch, "resultSummary">> & {
    /**
     * The statuses the Job actually entered, in order, ending with its own
     * status (e.g. `["queued", "cancelled"]` for a Job cancelled before it
     * ran). Default: queued, then running, then a terminal status; a `queued`
     * Job entered only itself.
     */
    transitions?: readonly JobStatus[];
  };

function defaultTransitions(status: JobStatus): JobStatus[] {
  if (status === "queued") return [status];
  return status === "running"
    ? ["queued", "running"]
    : ["queued", "running", status];
}

/**
 * The log entries core would have appended for the transitions a seeded Job
 * went through. Keeps seeded Jobs visible in
 * Recent activity without inventing steps the Job never took.
 */
async function seedJobActivity(
  exec: DbExec,
  job: JobRow,
  transitions: readonly JobStatus[]
): Promise<void> {
  const actions = transitions.filter((action) =>
    (ACTIVITY_ENTRY_ACTIONS.job as readonly string[]).includes(action)
  );
  for (const action of actions) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- entries must append in order
    const row = await activityLogRepo.append(exec, {
      caseId: job.caseId,
      kind: "job",
      action,
      subjectId: job.id,
      groupId: job.playbookRunId,
      actorId: job.actorId,
      toValue: action,
    });
    if (!row) throw new Error("seedJob activity failed");
  }
}

export async function seedJob(
  exec: DbExec,
  caseId: CaseId,
  overrides?: SeedJobOverrides
): Promise<JobRow> {
  const { resultSummary, transitions, ...createOverrides } = overrides ?? {};
  const status = createOverrides.status ?? "queued";
  const entered = transitions ?? defaultTransitions(status);
  // Validate before the insert: a bad list must not leave a Job row behind.
  if (entered.at(-1) !== status) {
    throw new Error(
      `seedJob transitions must end with the Job's status (${status})`
    );
  }
  const created = await jobsRepo.create(exec, {
    caseId,
    capabilityId: createOverrides.capabilityId ?? "network.dns.lookup",
    input: createOverrides.input ?? { host: "example.com" },
    status,
    actorId: createOverrides.actorId ?? TEST_ACTOR_ID,
    actorLabel: createOverrides.actorLabel,
    actorKeyId: createOverrides.actorKeyId,
    logs: createOverrides.logs,
    playbookRunId: createOverrides.playbookRunId,
    playbookStep: createOverrides.playbookStep,
    playbookFanIndex: createOverrides.playbookFanIndex,
    output: createOverrides.output,
    evidenceIds: createOverrides.evidenceIds,
    pivots: createOverrides.pivots,
  });
  if (!created) {
    throw new Error("seedJob failed");
  }
  await seedJobActivity(exec, created, entered);
  if (resultSummary === undefined) {
    await flushCollectQueue(exec);
    return created;
  }
  const updated = await jobsRepo.update(exec, created.id, { resultSummary });
  if (!updated) {
    throw new Error("seedJob resultSummary update failed");
  }
  await flushCollectQueue(exec);
  return updated;
}

/**
 * Backdate `updated_at` (and optionally `started_at`) on a seeded Job so stale
 * reclaim tests can age it. Production code cannot set `updated_at`, so
 * `jobsRepo.update` does not accept it; this writes the column directly.
 */
export async function backdateJob(
  exec: DbExec,
  jobId: string,
  times: { updatedAt: Date; startedAt?: Date }
): Promise<void> {
  await exec.update(jobs).set(times).where(eq(jobs.id, jobId));
  await flushCollectQueue(exec);
}

/**
 * Put a seeded Job in `status` without the lifecycle: a test that needs a Job another run has
 * already moved (a failed step, a finished enrich) sets it here. Production writes go through
 * `settleJobEffect`; this writes the column directly and appends no activity entry.
 */
export async function forceJobStatus(
  exec: DbExec,
  jobId: string,
  status: JobStatus,
  fields?: { error?: string }
): Promise<void> {
  await exec
    .update(jobs)
    .set({ status, ...fields })
    .where(eq(jobs.id, jobId));
  await flushCollectQueue(exec);
}
