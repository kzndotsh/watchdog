import { setGraphHistoryContext, type DbExec } from "@watchdog/db";
import type { PatchOp } from "@watchdog/domain/schemas/graph";
import type { CaseId, ConfidenceTier } from "@watchdog/domain/schemas/shared";
import { TEST_ACTOR_ID } from "@watchdog/domain/test-kit/fixtures";

import { withCaseOrganizationScope } from "../organization-scope.ts";
import { withSystemHistoryContext } from "../system-history-context.ts";

/** An agent graph write's changeset (`agent_write`, #724), with no Graph rows. */
export async function seedGraphWrite(
  exec: DbExec,
  caseId: CaseId,
  patch: PatchOp[],
  overrides?: {
    actorId?: string;
    actorLabel?: string;
    confidence?: ConfidenceTier;
    summary?: string | null;
    idempotencyKey?: string | null;
  }
): Promise<{ id: string }> {
  const id = await withCaseOrganizationScope(exec, caseId, async (scoped) =>
    withSystemHistoryContext(scoped, async (tx) =>
      setGraphHistoryContext(tx, {
        actorId: overrides?.actorId ?? TEST_ACTOR_ID,
        actorLabel: overrides?.actorLabel,
        channel: "agent_write",
        changeset: {
          caseId,
          confidence: overrides?.confidence ?? "unverified",
          summary: overrides?.summary ?? null,
          patch,
          idempotencyKey: overrides?.idempotencyKey ?? null,
        },
      })
    )
  );
  if (id === null) {
    throw new Error("seedGraphWrite failed");
  }
  return { id };
}
