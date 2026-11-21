import { z } from "zod";

import { evidenceKindSchema } from "./enums";
import { caseIdSchema } from "./ids";
import { listPageSchema } from "./lists/list-page";

export const evidenceSchema = z.object({
  id: z.uuid(),
  caseId: caseIdSchema,
  entityId: z.uuid().nullable(),
  kind: evidenceKindSchema,
  label: z.string().nullable(),
  notes: z.string().nullable(),
  mime: z.string().nullable(),
  uri: z.string().nullable(),
  sha256: z.string().nullable(),
  text: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  actorId: z.string(),
  actorLabel: z.string(),
  capturedAt: z.string(),
  processedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
});

/** An Evidence picker's item (#566): title parts and capture time, no body. */
export const evidencePickerItemSchema = z.object({
  id: z.uuid(),
  kind: evidenceKindSchema,
  label: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  sha256: z.string().nullable(),
  capturedAt: z.string(),
});

/** Declared lists (ADR-0007): a page plus `total` on the first page. */
export const evidenceListPageSchema = listPageSchema(evidenceSchema);
export const evidencePickerPageSchema = listPageSchema(
  evidencePickerItemSchema
);

/**
 * Short-lived links to one Evidence file. `url` always downloads it as a file; `previewUrl`
 * renders inline and is set only for an allowlisted image type (`INLINE_IMAGE_MIMES`).
 */
export const evidenceDownloadUrlsSchema = z.object({
  url: z.string().nullable(),
  previewUrl: z.string().nullable(),
});
export type EvidenceDownloadUrls = z.output<typeof evidenceDownloadUrlsSchema>;
