import { z } from "zod";

export const waybackChangeSummarySchema = z.object({
  titleChanged: z.boolean(),
  previousTitle: z.string().nullable(),
  /** Visible-text length now minus before, in characters. */
  textLengthDelta: z.number().int(),
  /** Visible-text lines present now and not before (order-insensitive, duplicates counted). */
  linesAdded: z.number().int(),
  linesRemoved: z.number().int(),
  /** A few of the lines, cut short; never the whole diff. */
  sampleAdded: z.array(z.string()),
  sampleRemoved: z.array(z.string()),
});

export const waybackVersionSchema = z.object({
  timestamp: z.string(),
  original: z.string(),
  archiveUrl: z.string(),
  /** CDX content digest of the capture. */
  digest: z.string().nullable(),
  /** SHA-256 of the stored bytes (after the toolbar and playback scripts were stripped). */
  contentHash: z.string(),
  mimetype: z.string().nullable(),
  /** Bytes stored for this version. */
  byteLength: z.number().int(),
  /** The body hit the byte cap, so the stored copy may be cut short. */
  bodyTruncated: z.boolean(),
  title: z.string().nullable(),
  /** Characters of visible text; `null` for a body that is not text. */
  textLength: z.number().int().nullable(),
  /** The artifact this version is stored as (a Case Evidence file). */
  artifactName: z.string(),
  /** Against the previous stored version; `null` for the first. */
  change: waybackChangeSummarySchema.nullable(),
});

const waybackDuplicateSchema = z.object({
  timestamp: z.string(),
  digest: z.string().nullable(),
  /** The earlier version with the same stored content. */
  duplicateOf: z.string(),
});

export const waybackFailedVersionSchema = z.object({
  timestamp: z.string(),
  reason: z.enum([
    "rate_limited",
    "http_error",
    "fetch_failed",
    "skipped_rate_limited",
    "skipped_time_budget",
  ]),
  status: z.number().int().nullable(),
});

export const waybackHistorySnapshotSchema = z.object({
  url: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("web.archive.org"),
  after: z.string().nullable(),
  before: z.string().nullable(),
  maxVersions: z.number().int(),
  /** Distinct versions (digest changes) the lookup listed, up to `maxVersions`. */
  versionsListed: z.number().int(),
  /** Captures in the range, when the lookup could count them. */
  totalCaptures: z.number().int().nullable(),
  versions: z.array(waybackVersionSchema),
  duplicates: z.array(waybackDuplicateSchema),
  failed: z.array(waybackFailedVersionSchema),
  /** More distinct versions exist than `maxVersions`. */
  isTruncated: z.boolean(),
});

export type WaybackChangeSummary = z.infer<typeof waybackChangeSummarySchema>;
export type WaybackVersion = z.infer<typeof waybackVersionSchema>;
export type WaybackFailedVersion = z.infer<typeof waybackFailedVersionSchema>;
export type WaybackHistorySnapshot = z.infer<
  typeof waybackHistorySnapshotSchema
>;
