import { graphWritesRepo, type DbExec, type NewGraphWrite } from "@watchdog/db";
import type { PatchOp } from "@watchdog/schemas";
import { TEST_ACTOR_ID } from "@watchdog/test-kit/fixtures";

export async function seedGraphWrite(
  exec: DbExec,
  caseId: string,
  patch: PatchOp[],
  overrides?: Partial<NewGraphWrite>
): Promise<{ id: string }> {
  const overridesResolved = overrides ?? {};
  const created = await graphWritesRepo.create(exec, {
    caseId,
    actorId: overridesResolved.actorId ?? TEST_ACTOR_ID,
    channel: overridesResolved.channel ?? "agent_write",
    userOverridden: overridesResolved.userOverridden ?? true,
    confidence: overridesResolved.confidence ?? "unverified",
    summary: overridesResolved.summary ?? null,
    patch,
    idempotencyKey: overridesResolved.idempotencyKey ?? null,
  });
  if (!created) {
    throw new Error("seedGraphWrite failed");
  }
  return created;
}
