import {
  entitiesRepo,
  identifiersRepo,
  type DbExec,
  type IdentifierRow,
  type NewIdentifier,
} from "@watchdog/db";

import { withSystemHistoryContext } from "../system-history-context.ts";

export async function seedIdentifier(
  exec: DbExec,
  entityId: string,
  overrides: Partial<NewIdentifier> & Pick<NewIdentifier, "type" | "value">
): Promise<IdentifierRow> {
  // An Identifier carries its Entity's Case (same-Case foreign key), so read it from the Entity.
  const entity = await entitiesRepo.getById(exec, entityId);
  if (!entity) {
    throw new Error("seedIdentifier: no such Entity");
  }
  const created = await withSystemHistoryContext(exec, async (tx) =>
    identifiersRepo.create(tx, {
      entityId,
      caseId: entity.caseId,
      type: overrides.type,
      value: overrides.value,
      platform: overrides.platform ?? "",
      confidence: overrides.confidence ?? "unverified",
      status: overrides.status ?? "unknown",
      notes: overrides.notes ?? null,
      id: overrides.id,
    })
  );
  if (!created) {
    throw new Error("seedIdentifier failed");
  }
  return created;
}
