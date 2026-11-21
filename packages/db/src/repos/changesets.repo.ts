import { and, eq } from "drizzle-orm";

import {
  type CaseId,
  trimmedOrUndefined,
} from "@watchdog/domain/schemas/shared";

import type { DbExec } from "../exec";
import { changesets } from "../schema/changesets";
import { trimActorId, trimCaseId } from "./_scoped-ids";

export type ChangesetRow = typeof changesets.$inferSelect;

/**
 * Reads of `changesets` (#724). Rows are inserted by the history context
 * (`setGraphHistoryContext`) or the history trigger, never by a repo; the agent write list is
 * `graphWriteListRepo`.
 */
export const changesetsRepo = {
  /** The changeset an earlier agent write with this key recorded, if any. */
  async findIdByIdempotency(
    exec: DbExec,
    input: {
      caseId: CaseId;
      actorId: string;
      idempotencyKey: string;
    }
  ): Promise<string | null> {
    const scopedCaseId = trimCaseId(input.caseId);
    const scopedActorId = trimActorId(input.actorId);
    const idempotencyKey = trimmedOrUndefined(input.idempotencyKey);
    if (
      scopedCaseId === undefined ||
      scopedActorId === undefined ||
      idempotencyKey === undefined
    ) {
      return null;
    }
    const [existing] = await exec
      .select({ id: changesets.id })
      .from(changesets)
      .where(
        and(
          eq(changesets.caseId, scopedCaseId),
          eq(changesets.actorId, scopedActorId),
          eq(changesets.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);
    return existing?.id ?? null;
  },
};
