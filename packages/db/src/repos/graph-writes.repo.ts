import { and, eq } from "drizzle-orm";

import type {
  ConfidenceTier,
  GraphWriteChannel,
  PatchOp,
} from "@watchdog/schemas";
import { trimmedOrNull, trimmedOrUndefined } from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { graphWrites } from "../schema/graph-writes";
import { trimActorId, trimCaseId, trimResourceId } from "./_scoped-ids";

export type GraphWriteRow = typeof graphWrites.$inferSelect;

export interface NewGraphWrite {
  caseId: string;
  actorId: string;
  actorLabel?: string | null;
  channel: GraphWriteChannel;
  userOverridden: boolean;
  confidence: ConfidenceTier;
  summary: string | null;
  patch: PatchOp[];
  idempotencyKey: string | null;
}

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

  async listForCase(exec: DbExec, caseId: string): Promise<GraphWriteRow[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    return exec
      .select()
      .from(graphWrites)
      .where(eq(graphWrites.caseId, scopedCaseId));
  },

  async findIdByIdempotency(
    exec: DbExec,
    input: {
      caseId: string;
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
    const actorLabel =
      values.actorLabel === undefined || values.actorLabel === null
        ? values.actorLabel
        : trimmedOrNull(values.actorLabel);
    const summary =
      values.summary === undefined || values.summary === null
        ? values.summary
        : trimmedOrNull(values.summary);
    const [created] = await exec
      .insert(graphWrites)
      .values({
        ...values,
        caseId: scopedCaseId,
        actorId: scopedActorId,
        idempotencyKey: trimmedOrUndefined(values.idempotencyKey) ?? null,
        ...(values.actorLabel === undefined ? {} : { actorLabel }),
        ...(values.summary === undefined ? {} : { summary }),
      })
      .returning({ id: graphWrites.id });
    return created ?? null;
  },
};
