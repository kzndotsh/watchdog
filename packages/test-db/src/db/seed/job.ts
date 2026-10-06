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
import type { CaseId } from "@watchdog/schemas/shared";
import { TEST_ACTOR_ID } from "@watchdog/test-kit/fixtures";

type SeedJobOverrides = Partial<NewJob> &
  Partial<Pick<JobPatch, "resultSummary">>;

/**
 * The log entries core would have appended for a Job seeded in `status`:
 * queued, then the status entry when it is not queued (a `blocked` Job has no
 * log verb). Keeps seeded Jobs visible in Recent activity.
 */
async function seedJobActivity(exec: DbExec, job: JobRow): Promise<void> {
  const actions = (
    job.status === "blocked" ? [] : ["queued", job.status]
  ).filter(
    (action, index, all) =>
      all.indexOf(action) === index &&
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
  const { resultSummary, ...createOverrides } = overrides ?? {};
  const created = await jobsRepo.create(exec, {
    caseId,
    capabilityId: createOverrides.capabilityId ?? "network.dns.lookup",
    input: createOverrides.input ?? { host: "example.com" },
    status: createOverrides.status ?? "queued",
    actorId: createOverrides.actorId ?? TEST_ACTOR_ID,
    logs: createOverrides.logs,
    playbookRunId: createOverrides.playbookRunId,
    playbookStep: createOverrides.playbookStep,
    playbookFanIndex: createOverrides.playbookFanIndex,
    output: createOverrides.output,
    evidenceIds: createOverrides.evidenceIds,
    handoff: createOverrides.handoff,
  });
  if (!created) {
    throw new Error("seedJob failed");
  }
  await seedJobActivity(exec, created);
  if (resultSummary === undefined) {
    return created;
  }
  const updated = await jobsRepo.update(exec, created.id, { resultSummary });
  if (!updated) {
    throw new Error("seedJob resultSummary update failed");
  }
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
}
