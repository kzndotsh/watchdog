import { z } from "zod";

import { trimmedCaseIdSchema } from "./ids";
import { jsonObjectSchema } from "./json-wire";
import { defineList } from "./lists/define-list";
import { trimmedUuidSchema } from "./primitives";
import {
  GRAPH_HISTORY_CHANNELS,
  GRAPH_HISTORY_KINDS,
  GRAPH_HISTORY_OPS,
} from "./vocab";

/** A row's snapshot: the JSON a Graph row had at that moment (dates as ISO text). */
export const graphHistorySnapshotSchema = jsonObjectSchema;
export type GraphHistorySnapshot = z.output<typeof graphHistorySnapshotSchema>;

/** The scope of one row's history: its Case, its kind and its id. */
const graphHistoryScopeSchema = z.object({
  caseId: trimmedCaseIdSchema,
  kind: z.enum(GRAPH_HISTORY_KINDS),
  rowId: trimmedUuidSchema,
});

/** The row a history or its attribution is asked for. */
export const graphHistoryRowInputSchema = graphHistoryScopeSchema;
export type GraphHistoryRowInput = z.output<typeof graphHistoryRowInputSchema>;

/**
 * One Graph row's history (ADR-0007): every create, update, retract and delete of one Entity,
 * Edge, Claim, Identifier, Event, Question or Task, newest first. The scope is the row (Case,
 * kind, id); there is no filter and no search, and the one sort is the history id itself, in
 * both directions (`graph_history_case_row_idx` is `(case_id, kind, row_id, id desc)`). A row's
 * id is the history's bigint, so the cursor carries digits, not a uuid.
 */
export const graphHistoryList = defineList({
  name: "graph-history",
  noun: { one: "change", many: "changes" },
  scope: graphHistoryScopeSchema,
  idType: "int",
  filters: {},
  sorts: {
    change: { label: "Change", type: "int", dirs: ["desc", "asc"] },
  },
  defaultSort: "change.desc",
  limit: { default: 25, max: 100 },
});

export const graphHistoryEntrySchema = z.object({
  id: z.number().int().positive(),
  caseId: z.uuid(),
  kind: z.enum(GRAPH_HISTORY_KINDS),
  rowId: z.uuid(),
  op: z.enum(GRAPH_HISTORY_OPS),
  channel: z.enum(GRAPH_HISTORY_CHANNELS),
  /** The user who made the change; null for a system write. */
  actorId: z.string().nullable(),
  /** Resolved display name of `actorId`; null when the user is gone or unknown. */
  actorName: z.string().nullable(),
  /** API-key snapshot (`api-key:...`) when the change came through a key. */
  actorLabel: z.string().nullable(),
  before: graphHistorySnapshotSchema.nullable(),
  after: graphHistorySnapshotSchema.nullable(),
  /** Field names whose value differs between `before` and `after`. */
  changedFields: z.array(z.string()),
  at: z.string(),
});
export type GraphHistoryEntry = z.output<typeof graphHistoryEntrySchema>;

/** Who created and last changed the row as it stands now (display names; null: no recorded author). */
export const graphHistoryAttributionSchema = z.object({
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string(),
});
export type GraphHistoryAttribution = z.output<
  typeof graphHistoryAttributionSchema
>;
