import { Effect } from "effect";

import {
  db,
  evidenceRepo,
  type DbExec,
  type DbTx,
  type EvidenceRow,
} from "@watchdog/db";
import type { EvidenceKind } from "@watchdog/schemas";
import {
  parseGraphUuidList,
  parseTrimmedCaseId,
  trimmedOrNull,
  trimmedOrUndefined,
} from "@watchdog/schemas";

import { requireActorIdEffect } from "../actors/require-actor-id";
import {
  labelForActor,
  loadActorUsersEffect,
} from "../actors/resolve-actor-labels";
import {
  assertCaseExistsUncheckedEffect,
  assertCaseInOrgEffect,
  assertEntityInCaseEffect,
  requireTrimmedGraphId,
} from "../graph/patch/guards";
import {
  assertUploadedObjectEffect,
  createPresignedGetEffect,
  createPresignedPutEffect,
  uploadArtifactEffect,
  type PresignedPut,
} from "../infra/blob";
import { notifyEvidenceChangedEffect } from "../infra/events";
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
  entityId: string | null | undefined,
  exec: DbExec = db
): Effect.Effect<void, DomainTag> {
  if (entityId === undefined || entityId === null) {
    return Effect.void;
  }
  const trimmed = parseTrimmedCaseId(entityId);
  if (trimmed === null) {
    return new InvalidError({
      reason: "entityId must be a valid UUID",
    });
  }
  return assertEntityInCaseEffect(caseId, trimmed, exec).pipe(Effect.asVoid);
}

function entityIdForWrite(entityId: string | null | undefined): string | null {
  if (entityId === undefined || entityId === null) return null;
  return parseTrimmedCaseId(entityId) ?? null;
}

export function listEvidenceForCaseEffect(
  caseId: string,
  organizationId: string,
  opts?: ListEvidenceOpts
): Effect.Effect<EvidenceRecord[], DomainTag> {
  return Effect.gen(function* listEvidenceGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    if (
      opts?.hiddenOnly &&
      (opts.unprocessedOnly === true || opts.unattachedOnly === true)
    ) {
      return yield* new InvalidError({
        reason:
          "hiddenOnly is mutually exclusive with unprocessedOnly and unattachedOnly",
      });
    }
    const rows = yield* tryDb(() =>
      evidenceRepo.listForCase(db, scopedCaseId, {
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
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    yield* maybeAssertEntityEffect(scopedCaseId, input.entityId);
    const body = input.body.trim();
    if (body === "") {
      return yield* new InvalidError({ reason: "Paste body is required" });
    }
    const bytes = new TextEncoder().encode(body);
    const artifact = yield* uploadArtifactEffect({
      caseId: scopedCaseId,
      bytes,
      mime: "text/plain; charset=utf-8",
      name: "paste.txt",
    });
    const entityId = entityIdForWrite(input.entityId);
    const actorId = yield* requireActorIdEffect(input.actorId);
    const row = yield* tryDb(() =>
      evidenceRepo.create(db, {
        caseId: scopedCaseId,
        entityId,
        kind: "file",
        label: trimmedOrNull(input.label),
        mime: artifact.mime,
        uri: artifact.uri,
        sha256: artifact.sha256,
        sourceUrl: trimmedOrNull(input.sourceUrl),
        actorId,
        actorLabel: input.actorLabel ?? null,
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to create Evidence" });
    }
    const record = yield* labeledEvidence(row);
    yield* notifyEvidenceChangedEffect(scopedCaseId, record.id);
    return record;
  });
}

export function dumpUrlEffect(
  input: DumpUrlInput
): Effect.Effect<EvidenceRecord, DomainTag> {
  return Effect.gen(function* dumpUrlGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    yield* maybeAssertEntityEffect(scopedCaseId, input.entityId);
    const sourceUrl = trimmedOrUndefined(input.sourceUrl);
    if (sourceUrl === undefined) {
      return yield* new InvalidError({ reason: "URL is required" });
    }
    const entityId = entityIdForWrite(input.entityId);
    const actorId = yield* requireActorIdEffect(input.actorId);
    const row = yield* tryDb(() =>
      evidenceRepo.create(db, {
        caseId: scopedCaseId,
        entityId,
        kind: "other",
        label: trimmedOrNull(input.label),
        notes: trimmedOrNull(input.notes),
        sourceUrl,
        text: sourceUrl,
        actorId,
        actorLabel: input.actorLabel ?? null,
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to create Evidence" });
    }
    const record = yield* labeledEvidence(row);
    yield* notifyEvidenceChangedEffect(scopedCaseId, record.id);
    return record;
  });
}

export function softDeleteEvidenceEffect(
  input: SoftDeleteInput
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* softDeleteEvidenceGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const evidenceId = yield* requireTrimmedGraphId(
      input.evidenceId,
      "Evidence not found"
    );
    const row = yield* tryDb(() =>
      evidenceRepo.softDelete(db, scopedCaseId, evidenceId)
    );
    if (!row) {
      return yield* new NotFoundError({ resource: "Evidence not found" });
    }
    yield* notifyEvidenceChangedEffect(scopedCaseId, evidenceId);
  });
}

/** Clear soft-delete — returns the row to the active Intake queue. */
export function restoreEvidenceEffect(
  input: SoftDeleteInput
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* restoreEvidenceGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const evidenceId = yield* requireTrimmedGraphId(
      input.evidenceId,
      "Hidden Evidence not found"
    );
    const row = yield* tryDb(() =>
      evidenceRepo.restore(db, scopedCaseId, evidenceId)
    );
    if (!row) {
      return yield* new NotFoundError({
        resource: "Hidden Evidence not found",
      });
    }
    yield* notifyEvidenceChangedEffect(scopedCaseId, evidenceId);
  });
}

export function attachEvidenceEntityEffect(input: {
  caseId: string;
  organizationId: string;
  evidenceId: string;
  entityId: string | null;
}): Effect.Effect<EvidenceRecord, DomainTag> {
  return Effect.gen(function* attachEvidenceEntityGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const evidenceId = yield* requireTrimmedGraphId(
      input.evidenceId,
      "Evidence not found"
    );
    yield* maybeAssertEntityEffect(scopedCaseId, input.entityId);
    const entityId = entityIdForWrite(input.entityId);
    const row = yield* tryDb(() =>
      evidenceRepo.setEntityInCase(db, scopedCaseId, evidenceId, entityId)
    );
    if (!row) {
      return yield* new NotFoundError({ resource: "Evidence not found" });
    }
    const record = yield* labeledEvidence(row);
    yield* notifyEvidenceChangedEffect(scopedCaseId, record.id);
    return record;
  });
}

export function presignUploadEffect(
  input: PresignUploadInput
): Effect.Effect<PresignedPut, DomainTag> {
  return Effect.gen(function* presignUploadGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    return yield* createPresignedPutEffect({
      caseId: scopedCaseId,
      sha256: input.sha256,
      mime: input.mime,
      byteLength: input.byteLength,
      name: trimmedOrUndefined(input.name),
    });
  });
}

export function confirmFileUploadEffect(
  input: ConfirmFileUploadInput,
  actorId: string,
  actorLabel?: string | null
): Effect.Effect<EvidenceRecord, DomainTag> {
  return Effect.gen(function* confirmFileUploadGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const uri = trimmedOrUndefined(input.uri);
    if (uri === undefined) {
      return yield* new InvalidError({ reason: "uri is required" });
    }
    yield* maybeAssertEntityEffect(scopedCaseId, input.entityId);
    if (!uri.startsWith(`${scopedCaseId}/`)) {
      return yield* new InvalidError({
        reason: "uri does not belong to this Case",
      });
    }
    yield* assertUploadedObjectEffect({
      uri,
      sha256: input.sha256,
      mime: input.mime,
      byteLength: input.byteLength,
    });
    const entityId = entityIdForWrite(input.entityId);
    const scopedActorId = yield* requireActorIdEffect(actorId);
    const row = yield* tryDb(() =>
      evidenceRepo.create(db, {
        caseId: scopedCaseId,
        entityId,
        kind: "file",
        label: trimmedOrNull(input.label),
        mime: input.mime,
        uri,
        sha256: input.sha256,
        actorId: scopedActorId,
        actorLabel: actorLabel ?? null,
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to create Evidence" });
    }
    const record = yield* labeledEvidence(row);
    yield* notifyEvidenceChangedEffect(scopedCaseId, record.id);
    return record;
  });
}

export function getEvidenceDownloadUrlEffect(
  caseId: string,
  organizationId: string,
  evidenceId: string
): Effect.Effect<{ url: string | null }, DomainTag> {
  return Effect.gen(function* getEvidenceDownloadUrlGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedEvidenceId = yield* requireTrimmedGraphId(
      evidenceId,
      "Evidence not found"
    );
    const row = yield* tryDb(() =>
      evidenceRepo.getUriInCaseIncludingDeleted(
        db,
        scopedCaseId,
        normalizedEvidenceId
      )
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
    const scopedCaseId = yield* assertCaseExistsUncheckedEffect(
      input.caseId,
      exec
    );
    yield* maybeAssertEntityEffect(scopedCaseId, input.entityId, exec);
    const entityId = entityIdForWrite(input.entityId);

    const text = input.text.trim();
    if (!text) {
      return yield* new InvalidError({
        reason: "Attestation text is required",
      });
    }

    const actorId = yield* requireActorIdEffect(input.actorId);
    const row = yield* tryDb(() =>
      evidenceRepo.create(exec, {
        caseId: scopedCaseId,
        entityId,
        kind: "attestation",
        label: trimmedOrUndefined(input.label) ?? "Accept attestation",
        text,
        actorId,
        actorLabel: input.actorLabel ?? null,
      })
    );
    if (!row) {
      return yield* new InvalidError({
        reason: "Failed to create attestation",
      });
    }
    const record = yield* labeledEvidence(row);
    if (input.tx === undefined) {
      yield* notifyEvidenceChangedEffect(scopedCaseId, record.id);
    }
    return record;
  });
}

const INVALID_GRAPH_EVIDENCE_IDS = "One or more Evidence ids are invalid";
const EVIDENCE_NOT_IN_CASE =
  "One or more Evidence ids are missing or not in this Case";

/** Reject when any non-empty evidence id is not a valid graph UUID. */
export function parseGraphEvidenceIdsEffect(
  evidenceIds: Iterable<string | null | undefined>
): Effect.Effect<string[], DomainTag> {
  const unique = parseGraphUuidList(evidenceIds);
  if (unique === null) {
    return new InvalidError({
      reason: INVALID_GRAPH_EVIDENCE_IDS,
    });
  }
  return Effect.succeed(unique);
}

/** Assert each id exists in Case Evidence (hidden rows allowed for graph citations). */
export function assertEvidenceIdsInCaseEffect(
  caseId: string,
  evidenceIds: string[],
  exec: DbExec = db
): Effect.Effect<void, DomainTag> {
  const scopedCaseId = parseTrimmedCaseId(caseId);
  if (scopedCaseId === null) {
    return new InvalidError({ reason: "Case not found" });
  }
  const unique = parseGraphUuidList(evidenceIds);
  if (unique === null) {
    return new InvalidError({
      reason: INVALID_GRAPH_EVIDENCE_IDS,
    });
  }
  if (unique.length === 0) return Effect.void;
  return tryDb(() =>
    evidenceRepo.listIdsInCase(exec, scopedCaseId, unique)
  ).pipe(
    Effect.flatMap((rows) =>
      rows.length === unique.length
        ? Effect.void
        : new InvalidError({
            reason: EVIDENCE_NOT_IN_CASE,
          })
    )
  );
}
