import type { z } from "zod";

import type {
  EvidenceRecord as CoreEvidenceRecord,
  JobListRecord,
} from "@watchdog/core";
import type {
  attachEvidenceEntityInputSchema,
  confirmFileUploadInputSchema,
  dumpPasteInputSchema,
  dumpUrlInputSchema,
  evidenceScopeInputSchema,
  listEvidenceInputSchema,
  presignUploadInputSchema,
  processEvidenceInputSchema,
} from "@watchdog/schemas";

export type EvidenceRecord = CoreEvidenceRecord;

/** What the investigator sees in the state column. Derived, never stored. */
export type CollectState =
  | "queued"
  | "blocked"
  | "running"
  | "unprocessed"
  | "landed"
  | "failed"
  | "cancelled"
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

export type ListEvidenceInput = z.output<typeof listEvidenceInputSchema>;

export type EvidenceScopeInput = z.output<typeof evidenceScopeInputSchema>;

export type AttachEvidenceEntityInput = z.output<
  typeof attachEvidenceEntityInputSchema
>;

export type DumpPasteInput = z.output<typeof dumpPasteInputSchema>;

export type DumpUrlInput = z.output<typeof dumpUrlInputSchema>;

export type ProcessEvidenceInput = z.output<typeof processEvidenceInputSchema>;

export type PresignUploadInput = z.output<typeof presignUploadInputSchema>;

export type ConfirmFileUploadInput = z.output<
  typeof confirmFileUploadInputSchema
>;
