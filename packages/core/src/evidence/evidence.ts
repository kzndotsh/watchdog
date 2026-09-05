import { Effect } from "effect";

import {
  db,
  evidenceRepo,
  type DbExec,
  type DbTx,
  type EvidenceRow,
} from "@watchdog/db";
import type { EvidenceKind } from "@watchdog/schemas";
import { normalizeIdList, trimmedOrUndefined } from "@watchdog/schemas";

import {
  labelForActor,
  loadActorUsersEffect,
} from "../actors/resolve-actor-labels";
import {
  assertCaseExistsUncheckedEffect,
  assertCaseInOrgEffect,
  assertEntityInCaseEffect,
} from "../graph/patch/guards";
import {
  assertUploadedObjectEffect,
  createPresignedGetEffect,
  createPresignedPutEffect,
  uploadArtifactEffect,
  type PresignedPut,
} from "../infra/blob";
import { tryDb } from "../infra/postgres-effect";
import {
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";

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
  actorLabel: string;
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
  organizationId: string;
  body: string;
  label?: string;
  sourceUrl?: string;
  entityId?: string;
  actorId: string;
  actorLabel?: string | null;
}

export interface DumpUrlInput {
  caseId: string;
  organizationId: string;
  sourceUrl: string;
  label?: string;
  notes?: string;
  entityId?: string;
  actorId: string;
  actorLabel?: string | null;
}

export interface SoftDeleteInput {
  caseId: string;
  organizationId: string;
  evidenceId: string;
}

export interface PresignUploadInput {
  caseId: string;
  organizationId: string;
  sha256: string;
  mime: string;
  byteLength: number;
  name?: string;
}

export interface ConfirmFileUploadInput {
  caseId: string;
  organizationId: string;
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
  actorLabel?: string | null;
  /** When set, insert inside this transaction (no nested begin). */
  tx?: DbTx;
}

function toRecord(
  row: EvidenceRow,
  users: ReadonlyMap<string, { name: string; email: string }> = new Map()
): EvidenceRecord {
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
    actorLabel: labelForActor(row.actorId, users, row.actorLabel),
    capturedAt: row.capturedAt.toISOString(),
    processedAt: row.processedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

function labeledEvidence(
  row: EvidenceRow
): Effect.Effect<EvidenceRecord, DomainTag> {
  return loadActorUsersEffect([row.actorId]).pipe(
    Effect.map((users) => toRecord(row, users))
  );
}

function maybeAssertEntityEffect(
  caseId: string,
  entityId: string | undefined
): Effect.Effect<void, DomainTag> {
  if (entityId !== undefined && entityId !== "") {
    return assertEntityInCaseEffect(caseId, entityId);
  }
  return Effect.void;
}

export function listEvidenceForCaseEffect(
  caseId: string,
  organizationId: string,
  opts?: ListEvidenceOpts
): Effect.Effect<EvidenceRecord[], DomainTag> {
  return Effect.gen(function* listEvidenceGen() {
    yield* assertCaseInOrgEffect(caseId, organizationId);
    const rows = yield* tryDb(() =>
      evidenceRepo.listForCase(db, caseId, {
        deletedOnly: opts?.hiddenOnly,
        unprocessedOnly: opts?.unprocessedOnly,
        unattachedOnly: opts?.unattachedOnly,
      })
    );
    const users = yield* loadActorUsersEffect(rows.map((row) => row.actorId));
    return rows.map((row) => toRecord(row, users));
  });
}

export function dumpPasteEffect(
  input: DumpPasteInput
): Effect.Effect<EvidenceRecord, DomainTag> {
  return Effect.gen(function* dumpPasteGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    yield* maybeAssertEntityEffect(input.caseId, input.entityId);
    const bytes = new TextEncoder().encode(input.body);
    const artifact = yield* uploadArtifactEffect({
      caseId: input.caseId,
      bytes,
      mime: "text/plain; charset=utf-8",
      name: "paste.txt",
    });
    const row = yield* tryDb(() =>
      evidenceRepo.create(db, {
        caseId: input.caseId,
        entityId: input.entityId ?? null,
        kind: "file",
        label: input.label ?? null,
        mime: artifact.mime,
        uri: artifact.uri,
        sha256: artifact.sha256,
        sourceUrl: input.sourceUrl ?? null,
        actorId: input.actorId,
        actorLabel: input.actorLabel ?? null,
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to create Evidence" });
    }
    return yield* labeledEvidence(row);
  });
}

export function dumpUrlEffect(
  input: DumpUrlInput
): Effect.Effect<EvidenceRecord, DomainTag> {
  return Effect.gen(function* dumpUrlGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    yield* maybeAssertEntityEffect(input.caseId, input.entityId);
    const row = yield* tryDb(() =>
      evidenceRepo.create(db, {
        caseId: input.caseId,
        entityId: input.entityId ?? null,
        kind: "other",
        label: input.label ?? null,
        notes: input.notes ?? null,
        sourceUrl: input.sourceUrl,
        text: input.sourceUrl,
        actorId: input.actorId,
        actorLabel: input.actorLabel ?? null,
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to create Evidence" });
    }
    return yield* labeledEvidence(row);
  });
}

export function softDeleteEvidenceEffect(
  input: SoftDeleteInput
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* softDeleteEvidenceGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    const row = yield* tryDb(() =>
      evidenceRepo.softDelete(db, input.caseId, input.evidenceId)
    );
    if (!row) {
      return yield* new NotFoundError({ resource: "Evidence not found" });
    }
  });
}

/** Clear soft-delete — returns the row to the active Intake queue. */
export function restoreEvidenceEffect(
  input: SoftDeleteInput
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* restoreEvidenceGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    const row = yield* tryDb(() =>
      evidenceRepo.restore(db, input.caseId, input.evidenceId)
    );
    if (!row) {
      return yield* new NotFoundError({
        resource: "Hidden Evidence not found",
      });
    }
  });
}

export function attachEvidenceEntityEffect(input: {
  caseId: string;
  organizationId: string;
  evidenceId: string;
  entityId: string | null;
}): Effect.Effect<EvidenceRecord, DomainTag> {
  return Effect.gen(function* attachEvidenceEntityGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    const entityId =
      input.entityId === null || input.entityId === "" ? null : input.entityId;
    if (entityId !== null) {
      yield* assertEntityInCaseEffect(input.caseId, entityId);
    }
    const row = yield* tryDb(() =>
      evidenceRepo.setEntityInCase(db, input.caseId, input.evidenceId, entityId)
    );
    if (!row) {
      return yield* new NotFoundError({ resource: "Evidence not found" });
    }
    return yield* labeledEvidence(row);
  });
}

export function presignUploadEffect(
  input: PresignUploadInput
): Effect.Effect<PresignedPut, DomainTag> {
  return Effect.gen(function* presignUploadGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    return yield* createPresignedPutEffect({
      caseId: input.caseId,
      sha256: input.sha256,
      mime: input.mime,
      byteLength: input.byteLength,
      name: input.name,
    });
  });
}

export function confirmFileUploadEffect(
  input: ConfirmFileUploadInput,
  actorId: string,
  actorLabel?: string | null
): Effect.Effect<EvidenceRecord, DomainTag> {
  return Effect.gen(function* confirmFileUploadGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    yield* maybeAssertEntityEffect(input.caseId, input.entityId);
    if (!input.uri.startsWith(`${input.caseId}/`)) {
      return yield* new InvalidError({
        reason: "uri does not belong to this Case",
      });
    }
    yield* assertUploadedObjectEffect({
      uri: input.uri,
      sha256: input.sha256,
      mime: input.mime,
      byteLength: input.byteLength,
    });
    const row = yield* tryDb(() =>
      evidenceRepo.create(db, {
        caseId: input.caseId,
        entityId: input.entityId ?? null,
        kind: "file",
        label: input.label ?? null,
        mime: input.mime,
        uri: input.uri,
        sha256: input.sha256,
        actorId,
        actorLabel: actorLabel ?? null,
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to create Evidence" });
    }
    return yield* labeledEvidence(row);
  });
}

export function getEvidenceDownloadUrlEffect(
  caseId: string,
  organizationId: string,
  evidenceId: string
): Effect.Effect<{ url: string | null }, DomainTag> {
  return Effect.gen(function* getEvidenceDownloadUrlGen() {
    yield* assertCaseInOrgEffect(caseId, organizationId);
    const row = yield* tryDb(() =>
      evidenceRepo.getUriInCaseIncludingDeleted(db, caseId, evidenceId)
    );
    const uri = row?.uri;
    if (uri === undefined || uri === null || uri === "") {
      return { url: null };
    }
    const url = yield* createPresignedGetEffect(uri);
    return { url };
  });
}

/**
 * Human attestation note — text-only Evidence (no MinIO blob).
 * Used on Inbox Accept when the investigator pastes a citeable note.
 * Caller must already have org-scoped the case (Accept path).
 */
export function createAttestationEffect(
  input: CreateAttestationInput
): Effect.Effect<EvidenceRecord, DomainTag> {
  return Effect.gen(function* createAttestationGen() {
    const exec = input.tx ?? db;
    yield* assertCaseExistsUncheckedEffect(input.caseId, exec);
    if (input.entityId !== undefined && input.entityId !== "") {
      yield* assertEntityInCaseEffect(input.caseId, input.entityId, exec);
    }

    const text = input.text.trim();
    if (!text) {
      return yield* new InvalidError({
        reason: "Attestation text is required",
      });
    }

    const row = yield* tryDb(() =>
      evidenceRepo.create(exec, {
        caseId: input.caseId,
        entityId: input.entityId ?? null,
        kind: "attestation",
        label: trimmedOrUndefined(input.label) ?? "Accept attestation",
        text,
        actorId: input.actorId,
        actorLabel: input.actorLabel ?? null,
      })
    );
    if (!row) {
      return yield* Effect.die(new Error("Failed to create attestation"));
    }
    return yield* labeledEvidence(row);
  });
}

/** Assert each id is live Case Evidence (not soft-deleted). */
export function assertEvidenceIdsInCaseEffect(
  caseId: string,
  evidenceIds: string[],
  exec: DbExec = db
): Effect.Effect<void, DomainTag> {
  const unique = normalizeIdList(evidenceIds);
  if (unique.length === 0) return Effect.void;
  return tryDb(() => evidenceRepo.listIdsInCase(exec, caseId, unique)).pipe(
    Effect.flatMap((rows) =>
      rows.length === unique.length
        ? Effect.void
        : new InvalidError({
            reason:
              "One or more Evidence ids are missing, soft-deleted, or not in this Case",
          })
    )
  );
}
