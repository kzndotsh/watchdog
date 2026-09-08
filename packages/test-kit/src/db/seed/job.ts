import {
  jobsRepo,
  type DbExec,
  type JobPatch,
  type JobRow,
  type NewJob,
} from "@watchdog/db";

import { TEST_ACTOR_ID } from "../../fixtures/ids.ts";

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
