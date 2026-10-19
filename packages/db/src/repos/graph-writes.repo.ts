import { and, desc, eq } from "drizzle-orm";

import type { PatchOp } from "@watchdog/schemas/graph";
import {
  type CaseId,
  type ConfidenceTier,
  type GraphWriteChannel,
  trimmedOrUndefined,
} from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { graphWrites } from "../schema/graph-writes";
import { keysetAfter } from "./_keyset";
import type { KeysetAfter } from "./_keyset";
import { trimActorId, trimCaseId, trimResourceId } from "./_scoped-ids";

export type GraphWriteRow = typeof graphWrites.$inferSelect;

export type NewGraphWrite = {
  caseId: CaseId;
  actorId: string;
  actorLabel?: string | null;
  channel: GraphWriteChannel;
  userOverridden: boolean;
  confidence: ConfidenceTier;
  summary: string | null;
  patch: PatchOp[];
  idempotencyKey: string | null;
};

export const graphWritesRepo = {
  async get(exec: DbExec, id: string): Promise<GraphWriteRow | null> {
    const scopedId = trimResourceId(id);
    if (scopedId === undefined) return null;
    const [row] = await exec
      .select()
      .from(graphWrites)
      .where(eq(graphWrites.id, scopedId))
      .limit(1);
    return row ?? null;
  },

  /** The Case's agent graph writes, newest first, optionally one page. */
  async listForCase(
    exec: DbExec,
    caseId: CaseId,
    page?: { limit: number; after?: KeysetAfter }
  ): Promise<GraphWriteRow[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    const scope = eq(graphWrites.caseId, scopedCaseId);
    const query = exec
      .select()
      .from(graphWrites)
      .where(
        and(
          scope,
          keysetAfter({
            table: graphWrites,
            idColumn: graphWrites.id,
            keys: [{ column: graphWrites.createdAt, time: true }],
            direction: "desc",
            after: page?.after,
            scope,
          })
        )
      )
      .orderBy(desc(graphWrites.createdAt), desc(graphWrites.id));
    return page === undefined ? query : query.limit(page.limit);
  },

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
      .select({ id: graphWrites.id })
      .from(graphWrites)
      .where(
        and(
          eq(graphWrites.caseId, scopedCaseId),
          eq(graphWrites.actorId, scopedActorId),
          eq(graphWrites.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);
    return existing?.id ?? null;
  },

  async create(
    exec: DbExec,
    values: NewGraphWrite
  ): Promise<{ id: string } | null> {
    const scopedCaseId = trimCaseId(values.caseId);
    const scopedActorId = trimActorId(values.actorId);
    if (scopedCaseId === undefined || scopedActorId === undefined) return null;
    const [created] = await exec
      .insert(graphWrites)
      .values({
        ...values,
        caseId: scopedCaseId,
        actorId: scopedActorId,
      })
      .returning({ id: graphWrites.id });
    return created ?? null;
  },
};
