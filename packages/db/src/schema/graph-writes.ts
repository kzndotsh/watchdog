import { sql } from "drizzle-orm";
import {
  boolean,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  ConfidenceTier,
  GraphWriteChannel,
  PatchOp,
} from "@watchdog/schemas";

import { createdAt } from "./_helpers";
import { cases } from "./cases";

/**
 * Audit unit for Graph mutations that bypass Inbox (agent write today).
 * One request → one row. Accept / Dossier channels can attach later.
 */
export const graphWrites = pgTable(
  "graph_writes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull(),
    actorLabel: text("actor_label"),
    channel: text("channel").$type<GraphWriteChannel>().notNull(),
    userOverridden: boolean("user_overridden").notNull().default(true),
    confidence: text("confidence").$type<ConfidenceTier>().notNull(),
    summary: text("summary"),
    patch: jsonb("patch").$type<PatchOp[]>().notNull(),
    idempotencyKey: text("idempotency_key"),
    createdAt,
  },
  (t) => [
    uniqueIndex("graph_writes_case_actor_idem_uidx")
      .on(t.caseId, t.actorId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} IS NOT NULL`),
  ]
);
