import {
  activityLogRepo,
  proposalsRepo,
  type DbExec,
  type NewProposal,
} from "@watchdog/db";
import type { PatchOp } from "@watchdog/schemas/graph";
import type { CaseId } from "@watchdog/schemas/shared";

export async function seedProposal(
  exec: DbExec,
  caseId: CaseId,
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
  // The entries the write paths append, so a seeded Proposal shows in Recent
  // activity: `created`, then the decision when it is seeded already decided.
  const actions =
    overridesResolved.status === "accepted" ||
    overridesResolved.status === "rejected"
      ? (["created", overridesResolved.status] as const)
      : (["created"] as const);
  for (const action of actions) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- entries must append in order
    const entry = await activityLogRepo.append(exec, {
      caseId,
      kind: "proposal",
      action,
      subjectId: created.id,
      actorId: action === "created" ? overridesResolved.createdBy : undefined,
      fromValue: action === "created" ? null : "pending",
      toValue: action === "created" ? null : action,
    });
    if (!entry) {
      throw new Error("seedProposal activity failed");
    }
  }
  return created;
}
