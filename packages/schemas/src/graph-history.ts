import { z } from "zod";

import { trimmedCaseIdSchema } from "./ids";
import { jsonObjectSchema, trimmedUuidSchema } from "./primitives";
import {
  GRAPH_HISTORY_CHANNELS,
  GRAPH_HISTORY_KINDS,
  GRAPH_HISTORY_OPS,
} from "./vocab";

/** Largest page `listGraphHistory` returns; a larger `limit` is rejected, not clamped. */
export const GRAPH_HISTORY_PAGE_MAX = 100;
export const GRAPH_HISTORY_PAGE_DEFAULT = 25;

/** A row's snapshot: the JSON a Graph row had at that moment (dates as ISO text). */
export const graphHistorySnapshotSchema = jsonObjectSchema;
export type GraphHistorySnapshot = z.output<typeof graphHistorySnapshotSchema>;

export const listGraphHistoryInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  kind: z.enum(GRAPH_HISTORY_KINDS),
  rowId: trimmedUuidSchema,
  /** Opaque cursor from the previous page's `nextCursor`; omit for the newest entries. */
  cursor: z.string().trim().min(1).max(32).optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(GRAPH_HISTORY_PAGE_MAX)
    .default(GRAPH_HISTORY_PAGE_DEFAULT),
});
export type ListGraphHistoryInput = z.output<
  typeof listGraphHistoryInputSchema
>;

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

export const graphHistoryPageSchema = z.object({
  /** The live row's authorship; null once the row is deleted (its history stays). */
  attribution: graphHistoryAttributionSchema.nullable(),
  entries: z.array(graphHistoryEntrySchema),
  /** Pass as `cursor` for the next (older) page; null on the last page. */
  nextCursor: z.string().nullable(),
});
export type GraphHistoryPage = z.output<typeof graphHistoryPageSchema>;

const CURSOR_PATTERN = /^[1-9]\d{0,15}$/;

/** Parse a history cursor (a row id); null when malformed. */
export function parseGraphHistoryCursor(raw: string): number | null {
  if (!CURSOR_PATTERN.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}
