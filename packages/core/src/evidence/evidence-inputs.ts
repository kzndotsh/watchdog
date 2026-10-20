import type { DbTx } from "@watchdog/db";
import type { CaseId, OrganizationId } from "@watchdog/schemas/shared";

/** The inputs of the Evidence write services (`evidence.ts`). */
export type DumpPasteInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  body: string;
  label?: string;
  sourceUrl?: string;
  entityId?: string;
  actorId: string;
  actorLabel?: string | null;
};

export type DumpUrlInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  sourceUrl: string;
  label?: string;
  notes?: string;
  entityId?: string;
  actorId: string;
  actorLabel?: string | null;
};

export type SoftDeleteInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  evidenceId: string;
  /** Who hid or restored it, for the activity entry. */
  actorId?: string;
  actorLabel?: string | null;
};

export type PresignUploadInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  sha256: string;
  mime: string;
  byteLength: number;
  name?: string;
  /** Who asked for the URL: recorded with the pending upload. */
  actorId: string;
};

export type ConfirmFileUploadInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  uri: string;
  sha256: string;
  mime: string;
  byteLength: number;
  label?: string;
  entityId?: string;
};

export type CreateAttestationInput = {
  caseId: CaseId;
  text: string;
  label?: string;
  entityId?: string;
  actorId: string;
  actorLabel?: string | null;
  /** When set, insert inside this transaction (no nested begin). */
  tx?: DbTx;
};
