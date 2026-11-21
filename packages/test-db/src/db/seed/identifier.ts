import { eq } from "drizzle-orm";

import {
  entities,
  entitiesRepo,
  identifiersRepo,
  type DbExec,
  type IdentifierRow,
  type NewIdentifier,
} from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";

import { withCaseOrganizationScope } from "../organization-scope.ts";
import { withSystemHistoryContext } from "../system-history-context.ts";
import { ownerDb } from "../with-test-tx.ts";

/** An Entity's Case, read as the owner (past row-level security), or undefined. */
async function entityCaseAsOwner(
  entityId: string
): Promise<{ caseId: CaseId } | undefined> {
  const rows = await ownerDb()
    .select({ caseId: entities.caseId })
    .from(entities)
    .where(eq(entities.id, entityId));
  return rows[0];
}

export async function seedIdentifier(
  exec: DbExec,
  entityId: string,
  overrides: Partial<NewIdentifier> & Pick<NewIdentifier, "type" | "value">
): Promise<IdentifierRow> {
  // An Identifier carries its Entity's Case (same-Case foreign key). Pass `overrides.caseId` for an
  // Entity of another organization seeded in an uncommitted transaction, which neither lookup
  // below can see. Otherwise it is read from the Entity: in `exec`'s scope, else as the owner (#719).
  const entity =
    overrides.caseId === undefined
      ? ((await entitiesRepo.getById(exec, entityId)) ??
        (await entityCaseAsOwner(entityId)))
      : { caseId: overrides.caseId };
  if (!entity) {
    throw new Error("seedIdentifier: no such Entity");
  }
  const created = await withCaseOrganizationScope(
    exec,
    entity.caseId,
    async (scoped) =>
      withSystemHistoryContext(scoped, async (tx) =>
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
      )
  );
  if (!created) {
    throw new Error("seedIdentifier failed");
  }
  return created;
}
