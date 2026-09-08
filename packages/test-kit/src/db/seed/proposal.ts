import { proposalsRepo, type DbExec, type NewProposal } from "@watchdog/db";
import type { PatchOp } from "@watchdog/schemas";

export async function seedProposal(
  exec: DbExec,
  caseId: string,
  patch: PatchOp[],
  overrides?: Partial<NewProposal>
): Promise<{ id: string }> {
  const overridesResolved = overrides ?? {};
  const created = await proposalsRepo.create(exec, {
    caseId,
    status: overridesResolved.status ?? "pending",
    patch,
    summary:
      overridesResolved.summary === undefined
        ? "test proposal"
        : overridesResolved.summary,
    suppressedCount: overridesResolved.suppressedCount,
    evidenceIds: overridesResolved.evidenceIds ?? [],
    jobId: overridesResolved.jobId,
    agentSourced: overridesResolved.agentSourced ?? false,
    userOverridden: overridesResolved.userOverridden ?? false,
    createdBy: overridesResolved.createdBy,
  });
  if (!created) {
    throw new Error("seedProposal failed");
  }
  return created;
}
