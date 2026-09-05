import { and, eq } from "drizzle-orm";

import type {
  ConfidenceTier,
  GraphWriteChannel,
  PatchOp,
} from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { graphWrites } from "../schema/graph-writes";

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
    const [row] = await exec
      .select()
      .from(graphWrites)
      .where(eq(graphWrites.id, id))
      .limit(1);
    return row ?? null;
  },

  async listForCase(exec: DbExec, caseId: string): Promise<GraphWriteRow[]> {
    return exec
      .select()
      .from(graphWrites)
      .where(eq(graphWrites.caseId, caseId));
  },

  async findIdByIdempotency(
    exec: DbExec,
    input: {
      caseId: string;
      actorId: string;
      idempotencyKey: string;
    }
  ): Promise<string | null> {
    const [existing] = await exec
      .select({ id: graphWrites.id })
      .from(graphWrites)
      .where(
        and(
          eq(graphWrites.caseId, input.caseId),
          eq(graphWrites.actorId, input.actorId),
          eq(graphWrites.idempotencyKey, input.idempotencyKey)
        )
      )
      .limit(1);
    return existing?.id ?? null;
  },

  async create(
    exec: DbExec,
    values: NewGraphWrite
  ): Promise<{ id: string } | null> {
    const [created] = await exec
      .insert(graphWrites)
      .values(values)
      .returning({ id: graphWrites.id });
    return created ?? null;
  },
};
