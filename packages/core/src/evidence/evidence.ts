import {
  db,
  evidenceRepo,
  type DbExec,
  type DbTx,
  type EvidenceRow,
} from "@watchdog/db";
import type { EvidenceKind } from "@watchdog/schemas";
import { normalizeIdList, trimmedOrUndefined } from "@watchdog/schemas";

import { assertCaseExists, assertEntityInCase } from "../graph/patch/guards";
import {
  assertUploadedObject,
  createPresignedGet,
  createPresignedPut,
  uploadArtifact,
  type PresignedPut,
} from "../infra/blob";
import { DomainError } from "../infra/domain-error";

export interface EvidenceRecord {
  id: string;
  caseId: string;
  entityId: string | null;
  kind: EvidenceKind;
  label: string | null;
  notes: string | null;
  mime: string | null;
  uri: string | null;
  sha256: string | null;
  text: string | null;
  sourceUrl: string | null;
  actorId: string;
  capturedAt: string;
  processedAt: string | null;
  deletedAt: string | null;
}

export interface ListEvidenceOpts {
  unprocessedOnly?: boolean;
  unattachedOnly?: boolean;
  /** When true, only soft-deleted rows. Default: active queue only. */
  hiddenOnly?: boolean;
}

export interface DumpPasteInput {
  caseId: string;
  body: string;
  label?: string;
  sourceUrl?: string;
  entityId?: string;
  actorId: string;
}

export interface DumpUrlInput {
  caseId: string;
  sourceUrl: string;
  label?: string;
  notes?: string;
  entityId?: string;
  actorId: string;
}

export interface SoftDeleteInput {
  caseId: string;
  evidenceId: string;
}

export interface PresignUploadInput {
  caseId: string;
  sha256: string;
  mime: string;
  byteLength: number;
  name?: string;
}

export interface ConfirmFileUploadInput {
  caseId: string;
  uri: string;
  sha256: string;
  mime: string;
  byteLength: number;
  label?: string;
  entityId?: string;
}

export interface CreateAttestationInput {
  caseId: string;
  text: string;
  label?: string;
  entityId?: string;
  actorId: string;
  /** When set, insert inside this transaction (no nested begin). */
  tx?: DbTx;
}

function toRecord(row: EvidenceRow): EvidenceRecord {
  return {
    id: row.id,
    caseId: row.caseId,
    entityId: row.entityId ?? null,
    kind: row.kind,
    label: row.label ?? null,
    notes: row.notes ?? null,
    mime: row.mime ?? null,
    uri: row.uri ?? null,
    sha256: row.sha256 ?? null,
    text: row.text ?? null,
    sourceUrl: row.sourceUrl ?? null,
    actorId: row.actorId,
    capturedAt: row.capturedAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

export async function listEvidenceForCase(
  caseId: string,
  opts?: ListEvidenceOpts
): Promise<EvidenceRecord[]> {
  const rows = await evidenceRepo.listForCase(db, caseId, {
    deletedOnly: opts?.hiddenOnly,
    unprocessedOnly: opts?.unprocessedOnly,
    unattachedOnly: opts?.unattachedOnly,
  });
  return rows.map(toRecord);
}

export async function dumpPaste(
  input: DumpPasteInput
): Promise<EvidenceRecord> {
  await assertCaseExists(input.caseId);
  if (input.entityId !== undefined && input.entityId !== "")
    await assertEntityInCase(input.caseId, input.entityId);

  const bytes = new TextEncoder().encode(input.body);
  const artifact = await uploadArtifact({
    caseId: input.caseId,
    bytes,
    mime: "text/plain; charset=utf-8",
    name: "paste.txt",
  });

  const row = await evidenceRepo.create(db, {
    caseId: input.caseId,
    entityId: input.entityId ?? null,
    kind: "file",
    label: input.label ?? null,
    mime: artifact.mime,
    uri: artifact.uri,
    sha256: artifact.sha256,
    sourceUrl: input.sourceUrl ?? null,
    actorId: input.actorId,
  });
  if (!row) throw new DomainError("invalid", "Failed to create Evidence");
  return toRecord(row);
}

export async function dumpUrl(input: DumpUrlInput): Promise<EvidenceRecord> {
  await assertCaseExists(input.caseId);
  if (input.entityId !== undefined && input.entityId !== "")
    await assertEntityInCase(input.caseId, input.entityId);

  const row = await evidenceRepo.create(db, {
    caseId: input.caseId,
    entityId: input.entityId ?? null,
    kind: "other",
    label: input.label ?? null,
    notes: input.notes ?? null,
    sourceUrl: input.sourceUrl,
    text: input.sourceUrl,
    actorId: input.actorId,
  });
  if (!row) throw new DomainError("invalid", "Failed to create Evidence");
  return toRecord(row);
}

export async function softDeleteEvidence(
  input: SoftDeleteInput
): Promise<void> {
  const row = await evidenceRepo.softDelete(db, input.caseId, input.evidenceId);
  if (!row) throw new DomainError("not_found", "Evidence not found");
}

/** Clear soft-delete — returns the row to the active Intake queue. */
export async function restoreEvidence(input: SoftDeleteInput): Promise<void> {
  const row = await evidenceRepo.restore(db, input.caseId, input.evidenceId);
  if (!row) throw new DomainError("not_found", "Hidden Evidence not found");
}

export function attachEvidenceEntity(input: {
  caseId: string;
  evidenceId: string;
  entityId: string | null;
}): Promise<EvidenceRecord> {
  return assertCaseExists(input.caseId).then(async () => {
    const entityId =
      input.entityId === null || input.entityId === "" ? null : input.entityId;
    if (entityId !== null) {
      await assertEntityInCase(input.caseId, entityId);
    }
    const row = await evidenceRepo.setEntityInCase(
      db,
      input.caseId,
      input.evidenceId,
      entityId
    );
    if (!row) throw new DomainError("not_found", "Evidence not found");
    return toRecord(row);
  });
}

export async function presignUpload(
  input: PresignUploadInput
): Promise<PresignedPut> {
  await assertCaseExists(input.caseId);
  return await createPresignedPut({
    caseId: input.caseId,
    sha256: input.sha256,
    mime: input.mime,
    byteLength: input.byteLength,
    name: input.name,
  });
}

export async function confirmFileUpload(
  input: ConfirmFileUploadInput,
  actorId: string
): Promise<EvidenceRecord> {
  await assertCaseExists(input.caseId);
  if (input.entityId !== undefined && input.entityId !== "")
    await assertEntityInCase(input.caseId, input.entityId);

  if (!input.uri.startsWith(`${input.caseId}/`)) {
    throw new DomainError("invalid", "uri does not belong to this Case");
  }

  await assertUploadedObject({
    uri: input.uri,
    sha256: input.sha256,
    mime: input.mime,
    byteLength: input.byteLength,
  });

  const row = await evidenceRepo.create(db, {
    caseId: input.caseId,
    entityId: input.entityId ?? null,
    kind: "file",
    label: input.label ?? null,
    mime: input.mime,
    uri: input.uri,
    sha256: input.sha256,
    actorId,
  });
  if (!row) throw new DomainError("invalid", "Failed to create Evidence");
  return toRecord(row);
}

export function getEvidenceDownloadUrl(
  caseId: string,
  evidenceId: string
): Promise<{ url: string | null }> {
  return assertCaseExists(caseId)
    .then(() =>
      evidenceRepo.getUriInCaseIncludingDeleted(db, caseId, evidenceId)
    )
    .then((row) => {
      if (row === null || row.uri === null || row.uri === "") {
        return { url: null };
      }
      return createPresignedGet(row.uri).then((url) => ({ url }));
    });
}

/**
 * Human attestation note — text-only Evidence (no MinIO blob).
 * Used on Inbox Accept when the investigator pastes a citeable note.
 */
export async function createAttestation(
  input: CreateAttestationInput
): Promise<EvidenceRecord> {
  const exec = input.tx ?? db;
  await assertCaseExists(input.caseId, exec);
  if (input.entityId !== undefined && input.entityId !== "") {
    await assertEntityInCase(input.caseId, input.entityId, exec);
  }

  const text = input.text.trim();
  if (!text) throw new DomainError("invalid", "Attestation text is required");

  const row = await evidenceRepo.create(exec, {
    caseId: input.caseId,
    entityId: input.entityId ?? null,
    kind: "attestation",
    label: trimmedOrUndefined(input.label) ?? "Accept attestation",
    text,
    actorId: input.actorId,
  });
  if (!row) throw new Error("Failed to create attestation");
  return toRecord(row);
}

/** Assert each id is live Case Evidence (not soft-deleted). */
export async function assertEvidenceInCase(
  caseId: string,
  evidenceIds: string[],
  exec: DbExec = db
): Promise<void> {
  const unique = normalizeIdList(evidenceIds);
  if (unique.length === 0) return;
  const rows = await evidenceRepo.listIdsInCase(exec, caseId, unique);
  if (rows.length !== unique.length) {
    throw new DomainError(
      "invalid",
      "One or more Evidence ids are missing, soft-deleted, or not in this Case"
    );
  }
}
