import { z } from "zod";

import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import type { EvidenceRecord as CoreEvidenceRecord } from "@watchdog/core";
import {
  httpUrlSchema,
  nonEmptyTrimmed,
  optionalTrimmedSchema,
  sha256HexSchema,
  trimmedOrUndefined,
  uuidSchema,
} from "@watchdog/schemas";

export type EvidenceRecord = CoreEvidenceRecord;

/** What the investigator sees in the state column. Derived, never stored. */
export type CollectState =
  | "queued"
  | "running"
  | "unprocessed"
  | "landed"
  | "failed"
  | "hidden";

/** Why a Job is attached to this Evidence row. Classification is join-private. */
export type CollectRunRole = "collect" | "enrich" | "process" | "step";

export interface CollectRun {
  readonly job: JobListRecord;
  readonly role: CollectRunRole;
}

/**
 * One acquisition join: Evidence plus Jobs around it. Owned by Intake so
 * EvidenceDetail can resolve runs without importing Collect queue builders.
 */
export interface CollectRow {
  readonly id: string;
  readonly title: string;
  readonly hint: string | null;
  readonly state: CollectState;
  readonly when: string;
  readonly entityId: string | null;
  readonly evidence: EvidenceRecord | null;
  readonly runs: readonly CollectRun[];
  readonly playbookRunId: string | null;
  readonly recipe: { readonly step: number; readonly total: number } | null;
}

export interface PresignedUpload {
  url: string;
  uri: string;
  sha256: string;
  mime: string;
  byteLength: number;
  expiresIn: number;
  headers: Record<string, string>;
}

const optionalUuid = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = trimmedOrUndefined(value);
    return trimmed === undefined ? undefined : uuidSchema.parse(trimmed);
  });

const mimeSchema = z
  .string()
  .transform((value) => value.trim() || "application/octet-stream");

const sha256InputSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(sha256HexSchema);

export const listEvidenceInputSchema = z.object({
  caseId: uuidSchema,
  unprocessedOnly: z.boolean().optional().default(false),
  unattachedOnly: z.boolean().optional().default(false),
  hiddenOnly: z.boolean().optional().default(false),
});
export type ListEvidenceInput = z.output<typeof listEvidenceInputSchema>;

export const evidenceScopeInputSchema = z.object({
  caseId: uuidSchema,
  evidenceId: uuidSchema,
});
export type EvidenceScopeInput = z.output<typeof evidenceScopeInputSchema>;

export const attachEvidenceEntityInputSchema = evidenceScopeInputSchema.extend({
  entityId: z.uuid().nullable(),
});
export type AttachEvidenceEntityInput = z.output<
  typeof attachEvidenceEntityInputSchema
>;

export const dumpPasteInputSchema = z.object({
  caseId: uuidSchema,
  body: z.string().refine((value) => value.trim().length > 0, {
    message: "Paste body is required",
  }),
  label: optionalTrimmedSchema,
  sourceUrl: optionalTrimmedSchema.pipe(httpUrlSchema.optional()),
  entityId: optionalUuid,
});
export type DumpPasteInput = z.output<typeof dumpPasteInputSchema>;

export const dumpUrlInputSchema = z.object({
  caseId: uuidSchema,
  sourceUrl: nonEmptyTrimmed.pipe(httpUrlSchema),
  label: optionalTrimmedSchema,
  notes: optionalTrimmedSchema,
  entityId: optionalUuid,
});
export type DumpUrlInput = z.output<typeof dumpUrlInputSchema>;

export const processEvidenceInputSchema = evidenceScopeInputSchema.extend({
  /** When true, start `evidence.extract.ai` instead of `evidence.harvest`. */
  ai: z.boolean().optional().default(false),
});
export type ProcessEvidenceInput = z.output<typeof processEvidenceInputSchema>;

export const presignUploadInputSchema = z.object({
  caseId: uuidSchema,
  sha256: sha256InputSchema,
  mime: mimeSchema,
  byteLength: z.number().int().positive(),
  name: optionalTrimmedSchema,
});
export type PresignUploadInput = z.output<typeof presignUploadInputSchema>;

export const confirmFileUploadInputSchema = z.object({
  caseId: uuidSchema,
  uri: nonEmptyTrimmed,
  sha256: sha256InputSchema,
  mime: mimeSchema,
  byteLength: z.number().int().positive(),
  label: optionalTrimmedSchema,
  entityId: optionalUuid,
});
export type ConfirmFileUploadInput = z.output<
  typeof confirmFileUploadInputSchema
>;
