import { StaleVersionError } from "#core/errors";
import {
  updateEntityFieldsEffect,
  type EntityRecord,
  type UpdateEntityFieldsInput,
} from "#core/graph";
import { runDomain } from "#core/infra";
import { entitiesRepo } from "#db";
import { testDb as db } from "#test-db";

/**
 * Edit an Entity the way a careful client does under contention: read its version, send it,
 * and when another writer won (`StaleVersionError`) read again and retry. Every call lands
 * exactly once, in some order.
 */
export async function editEntityRetrying(
  input: Omit<UpdateEntityFieldsInput, "expectedVersion">
): Promise<EntityRecord> {
  for (;;) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each attempt rereads the version
    const row = await entitiesRepo.getInCase(db, input.caseId, input.entityId);
    if (row === null) throw new Error("entity missing");
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- retry follows the failed attempt
      return await runDomain(
        updateEntityFieldsEffect({ ...input, expectedVersion: row.version })
      );
    } catch (error) {
      if (!(error instanceof StaleVersionError)) throw error;
    }
  }
}
