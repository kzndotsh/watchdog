import type { z } from "zod";

import type { EvidenceRecord as CoreEvidenceRecord } from "@watchdog/core/evidence";
import type { JobListRecord } from "@watchdog/core/jobs";
import type {
  attachEvidenceEntityInputSchema,
  confirmFileUploadInputSchema,
  dumpPasteInputSchema,
  dumpUrlInputSchema,
  presignUploadInputSchema,
  processEvidenceInputSchema,
} from "@watchdog/schemas/evidence";
import type { evidenceScopeInputSchema } from "@watchdog/schemas/graph";
import type { PlaybookRunOutcome } from "@watchdog/schemas/shared";

export type EvidenceRecord = CoreEvidenceRecord;

/** What the investigator sees in the state column. Derived, never stored. */
export type CollectState =
  | "queued"
  | "running"
  | "unprocessed"
  | "landed"
  | "failed"
  | "cancelled"
  | "hidden";

/** Why a Job is attached to this Evidence row. Classification is join-private. */
export type CollectRunRole = "collect" | "enrich" | "process" | "step";

export type CollectRun = {
  readonly job: JobListRecord;
  readonly role: CollectRunRole;
};

/**
 * One acquisition join: Evidence plus Jobs around it. Owned by Intake so
 * EvidenceDetail can resolve runs without importing Collect queue builders.
 */
export type CollectRow = {
  readonly id: string;
  readonly title: string;
  readonly hint: string | null;
  readonly state: CollectState;
  readonly when: string;
  readonly entityId: string | null;
  readonly evidence: EvidenceRecord | null;
  readonly runs: readonly CollectRun[];
  readonly playbookRunId: string | null;
  readonly recipe: {
    readonly step: number;
    readonly total: number;
    /** How the run went once it finished; null while it runs. */
    readonly outcome?: PlaybookRunOutcome | null;
  } | null;
};

export type PresignedUpload = {
  url: string;
  uri: string;
  sha256: string;
  mime: string;
  byteLength: number;
  expiresIn: number;
  headers: Record<string, string>;
};

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
