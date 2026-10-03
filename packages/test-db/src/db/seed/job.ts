import { eq } from "drizzle-orm";

import {
  jobs,
  jobsRepo,
  type DbExec,
  type JobPatch,
  type JobRow,
  type NewJob,
} from "@watchdog/db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit/fixtures";

type SeedJobOverrides = Partial<NewJob> &
  Partial<Pick<JobPatch, "resultSummary">>;

export async function seedJob(
  exec: DbExec,
  caseId: string,
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
