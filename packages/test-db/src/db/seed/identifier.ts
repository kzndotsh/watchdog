import {
  identifiersRepo,
  type DbExec,
  type IdentifierRow,
  type NewIdentifier,
} from "@watchdog/db";

export async function seedIdentifier(
  exec: DbExec,
  entityId: string,
  overrides: Partial<NewIdentifier> & Pick<NewIdentifier, "type" | "value">
): Promise<IdentifierRow> {
  const created = await identifiersRepo.create(exec, {
    entityId,
    type: overrides.type,
    value: overrides.value,
    platform: overrides.platform ?? "",
    confidence: overrides.confidence ?? "unverified",
    status: overrides.status ?? "unknown",
    notes: overrides.notes ?? null,
    id: overrides.id,
  });
  if (!created) {
    throw new Error("seedIdentifier failed");
  }
  return created;
}
