import { z } from "zod";

export const waybackCdxRowSchema = z.object({
  timestamp: z.string(),
  original: z.string(),
  statuscode: z.string().optional(),
  mimetype: z.string().optional(),
  digest: z.string().optional(),
  /** CDX `length`: the size of the archived record as stored (compressed), not the page. */
  length: z.number().optional(),
});

export const waybackLookupSnapshotSchema = z.object({
  url: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("web.archive.org/cdx"),
  rows: z.array(waybackCdxRowSchema),
  closestTimestamp: z.string().nullable(),
  /** Captures were collapsed by content digest (`collapse=digest`): one row per change. */
  distinctOnly: z.boolean(),
  /** The CDX `from` / `to` actually sent (14-digit), `null` when unbounded. */
  from: z.string().nullable(),
  to: z.string().nullable(),
  /** `ok` = 200 or `-` (legacy captures record no status), `200` = only 200, `any` = unfiltered. */
  statusFilter: z.enum(["200", "ok", "any"]),
  /** Captures in the queried range. `null` when the count could not be taken. */
  totalCaptures: z.number().int().nullable(),
  /** `totalCaptures` hit the counting ceiling, so the true number is at least this. */
  totalCapturesIsLowerBound: z.boolean(),
  /** Versions (digest changes) among the rows listed: this page only when truncated. */
  distinctVersions: z.number().int(),
  /** Pass back as `resumeKey` to continue after the last row. */
  resumeKey: z.string().nullable(),
  /** More captures exist beyond the rows listed. */
  isTruncated: z.boolean(),
});

export type WaybackCdxRow = z.infer<typeof waybackCdxRowSchema>;
export type WaybackLookupSnapshot = z.infer<typeof waybackLookupSnapshotSchema>;

export const waybackFetchSnapshotSchema = z.object({
  url: z.string().min(1),
  timestamp: z.string().min(1),
  archiveUrl: z.string().min(1),
  queriedAt: z.string().min(1),
  status: z.number(),
  ok: z.boolean(),
  contentType: z.string().nullable(),
  bodyPreview: z.string(),
  byteLength: z.number(),
  error: z.string().optional(),
});

export type WaybackFetchSnapshot = z.infer<typeof waybackFetchSnapshotSchema>;
