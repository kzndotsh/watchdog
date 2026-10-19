import { Effect } from "effect";

import {
  evidenceLinksRepo,
  identifiersRepo,
  type IdentifierListRow,
  type IdentifierRow,
} from "@watchdog/db";
import { validateIdentifierWrite } from "@watchdog/schemas/graph";
import type {
  CaseId,
  ConfidenceTier,
  EntityKind,
  IdentifierStatus,
  IdentifierType,
  OrganizationId,
  Page,
} from "@watchdog/schemas/shared";
import { normalizeUuidList, trimmedOrNull } from "@watchdog/schemas/shared";

import {
  assertEvidenceIdsInCaseEffect,
  parseGraphEvidenceIdsEffect,
} from "../evidence/evidence";
import type { Db } from "../infra/db-service";
import { pageWindow, toPage } from "../infra/page";
import type { PageRequest } from "../infra/page";
import { tryDb, tryDbWith, requireWritten } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import {
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import {
  appendGraphActivityEffect,
  dossierHistory,
  setHistoryContextEffect,
  graphActorFields,
  type GraphActor,
} from "./graph-activity";
import {
  assertCaseInOrgEffect,
  assertConfidenceEvidenceEffect,
  assertEntityInCaseEffect,
  missedVersionedUpdateEffect,
  requireTrimmedGraphId,
} from "./patch/guards";

const NATURAL_KEY_INDEX = "identifiers_natural_uidx";
const DUPLICATE_MESSAGE = "That Identifier already exists on this Entity";

export type IdentifierRecord = {
  id: string;
  entityId: string;
  type: IdentifierType;
  platform: string;
  value: string;
  confidence: ConfidenceTier;
  status: IdentifierStatus;
  notes: string | null;
  evidenceIds: string[];
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: number;
};

export type CreateIdentifierInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  entityId: string;
  type: IdentifierType;
  value: string;
  confidence: ConfidenceTier;
  platform?: string;
  status: IdentifierStatus;
  notes?: string;
  evidenceIds?: string[];
} & GraphActor;

export type UpdateIdentifierInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  identifierId: string;
  /** The `version` the caller last read; an update of a row that moved on is `StaleVersionError`. */
  expectedVersion: number;
  value?: string;
  platform?: string | null;
  type?: IdentifierType;
  status?: IdentifierStatus;
  confidence?: ConfidenceTier;
  notes?: string | null;
  evidenceIds?: string[];
} & GraphActor;

function toRecord(row: IdentifierRow, evidenceIds: string[]): IdentifierRecord {
  return {
    id: row.id,
    entityId: row.entityId,
    type: row.type,
    platform: row.platform,
    value: row.value,
    confidence: row.confidence,
    status: row.status,
    notes: row.notes ?? null,
    evidenceIds: normalizeUuidList(evidenceIds),
    version: row.version,
  };
}

/** One page of an Entity's Identifiers, by type, value, then id. */
export function listIdentifiersForEntityEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  entityId: string,
  page: PageRequest = {}
): Effect.Effect<Page<IdentifierRecord>, DomainTag, Db> {
  return Effect.gen(function* listIdentifiersForEntityGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedEntityId = yield* requireTrimmedGraphId(entityId, "Entity");
    yield* assertEntityInCaseEffect(scopedCaseId, normalizedEntityId);
    const window = yield* pageWindow(page, 2);
    const found = yield* tryDbWith((exec) =>
      identifiersRepo.listForEntity(exec, normalizedEntityId, {
        limit: window.limit + 1,
        ...(window.after === undefined ? {} : { after: window.after }),
      })
    );
    const byId = yield* tryDbWith((exec) =>
      evidenceLinksRepo.listForIdentifiers(
        exec,
        found.slice(0, window.limit).map((r) => r.id)
      )
    );
    return toPage(
      found,
      window,
      (row) => toRecord(row, byId.get(row.id) ?? []),
      (row) => ({ id: row.id, values: [row.type, row.value] })
    );
  });
}

/** Identifier plus owning entity labels for case-wide lists. */
export type CaseIdentifierRecord = {
  entityName: string;
  entitySlug: string;
  entityKind: EntityKind;
  entitySummary: string | null;
  entityNotes: string | null;
} & IdentifierRecord;

export function toCaseIdentifierRecord(
  row: IdentifierListRow,
  evidenceIds: string[]
): CaseIdentifierRecord {
  return {
    ...toRecord(row, evidenceIds),
    entityName: row.entityName,
    entitySlug: row.entitySlug,
    entityKind: row.entityKind,
    entitySummary: row.entitySummary,
    entityNotes: row.entityNotes,
  };
}

/** One page of the Case's Identifiers, by Entity name, type, value, then id. */
export function listIdentifiersForCaseEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  page: PageRequest = {}
): Effect.Effect<Page<CaseIdentifierRecord>, DomainTag, Db> {
  return Effect.gen(function* listIdentifiersForCaseGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const window = yield* pageWindow(page, 3);
    const found = yield* tryDbWith((exec) =>
      identifiersRepo.listForCase(exec, scopedCaseId, {
        limit: window.limit + 1,
        ...(window.after === undefined ? {} : { after: window.after }),
      })
    );
    const byId = yield* tryDbWith((exec) =>
      evidenceLinksRepo.listForIdentifiers(
        exec,
        found.slice(0, window.limit).map((r) => r.id)
      )
    );
    return toPage(
      found,
      window,
      (row) => toCaseIdentifierRecord(row, byId.get(row.id) ?? []),
      (row) => ({ id: row.id, values: [row.entityName, row.type, row.value] })
    );
  });
}

export function createIdentifierEffect(
  input: CreateIdentifierInput
): Effect.Effect<IdentifierRecord, DomainTag, Db> {
  return Effect.gen(function* createIdentifierGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const written = validateIdentifierWrite({
      type: input.type,
      value: input.value,
      platform: input.platform,
    });
    if (!written.ok) {
      return yield* new InvalidError({ reason: written.message });
    }
    const { type, value, platform } = written;

    const evidenceIds = yield* parseGraphEvidenceIdsEffect(
      input.evidenceIds ?? []
    );
    yield* assertConfidenceEvidenceEffect(input.confidence, evidenceIds);

    const entityId = yield* requireTrimmedGraphId(input.entityId, "Entity");

    const row = yield* transact(
      (tx) =>
        Effect.gen(function* createIdentifierTx() {
          yield* setHistoryContextEffect(tx, dossierHistory(input));
          yield* assertEntityInCaseEffect(scopedCaseId, entityId, tx);
          yield* assertEvidenceIdsInCaseEffect(scopedCaseId, evidenceIds, tx);

          const created = yield* tryDb(() =>
            identifiersRepo.create(tx, {
              entityId,
              caseId: scopedCaseId,
              type,
              platform,
              value,
              confidence: input.confidence,
              status: input.status,
              notes: trimmedOrNull(input.notes),
            })
          ).pipe(requireWritten("create Identifier"));
          yield* tryDb(() =>
            evidenceLinksRepo.linkIdentifier(
              tx,
              scopedCaseId,
              created.id,
              evidenceIds
            )
          ).pipe(requireWritten("link evidence"));
          yield* appendGraphActivityEffect(tx, {
            ...graphActorFields(input),
            caseId: scopedCaseId,
            kind: "identifier",
            action: "created",
            subjectId: created.id,
            label: created.value,
          });
          // Linking Evidence touches the row (a version bump): return it as it now stands.
          return yield* tryDb(() =>
            identifiersRepo.getInCase(tx, scopedCaseId, created.id)
          ).pipe(requireWritten("read Identifier back"));
        }),
      { uniqueIndex: NATURAL_KEY_INDEX, conflictReason: DUPLICATE_MESSAGE }
    );

    return toRecord(row, evidenceIds);
  });
}

export function updateIdentifierEffect(
  input: UpdateIdentifierInput
): Effect.Effect<IdentifierRecord, DomainTag, Db> {
  return Effect.gen(function* updateIdentifierGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const identifierId = yield* requireTrimmedGraphId(
      input.identifierId,
      "Identifier"
    );
    const existing = yield* tryDbWith((exec) =>
      identifiersRepo.getInCase(exec, scopedCaseId, identifierId)
    );
    if (!existing) {
      return yield* new NotFoundError({
        entity: "Identifier",
        id: identifierId,
      });
    }

    if (
      input.value === undefined &&
      input.platform === undefined &&
      input.type === undefined &&
      input.status === undefined &&
      input.confidence === undefined &&
      input.notes === undefined &&
      input.evidenceIds === undefined
    ) {
      return yield* new InvalidError({ reason: "Nothing to update" });
    }

    const { row, evidenceIds: nextEvidenceIds } = yield* transact(
      (tx) =>
        Effect.gen(function* updateIdentifierTx() {
          yield* setHistoryContextEffect(tx, dossierHistory(input));
          const missedVersion = () =>
            Effect.gen(function* missedIdentifierVersionGen() {
              const current = yield* tryDb(() =>
                identifiersRepo.getInCase(tx, scopedCaseId, identifierId)
              );
              return yield* missedVersionedUpdateEffect(current, {
                entity: "Identifier",
                id: identifierId,
              });
            });
          let nextIds: string[];
          if (input.evidenceIds === undefined) {
            const byId = yield* tryDb(() =>
              evidenceLinksRepo.listForIdentifiers(tx, [existing.id])
            );
            nextIds = byId.get(existing.id) ?? [];
          } else {
            // Replacing the Evidence touches the row (a version bump), so the version is checked
            // first, by taking the row's lock only if it is still at `expectedVersion`.
            const locked = yield* tryDb(() =>
              identifiersRepo.lockAtVersionInCase(
                tx,
                scopedCaseId,
                identifierId,
                input.expectedVersion
              )
            );
            if (!locked) return yield* missedVersion();
            nextIds = yield* parseGraphEvidenceIdsEffect(input.evidenceIds);
            yield* assertEvidenceIdsInCaseEffect(scopedCaseId, nextIds, tx);
            const replaced = yield* tryDb(() =>
              evidenceLinksRepo.replaceIdentifier(
                tx,
                scopedCaseId,
                existing.id,
                nextIds
              )
            );
            if (replaced === null) {
              return yield* new InvalidError({
                reason: "Invalid evidence id",
              });
            }
            nextIds = replaced;
          }

          const nextConfidence = input.confidence ?? existing.confidence;
          yield* assertConfidenceEvidenceEffect(nextConfidence, nextIds);

          const patch: Parameters<typeof identifiersRepo.updateInCase>[3] = {};
          if (
            input.value !== undefined ||
            input.type !== undefined ||
            input.platform !== undefined
          ) {
            const nextPlatform =
              input.platform === undefined
                ? existing.platform
                : (trimmedOrNull(input.platform) ?? "");
            const written = validateIdentifierWrite({
              type: input.type ?? existing.type,
              value: input.value ?? existing.value,
              platform: nextPlatform,
            });
            if (!written.ok) {
              return yield* new InvalidError({ reason: written.message });
            }
            if (input.type !== undefined) patch.type = written.type;
            if (input.platform !== undefined) {
              patch.platform = written.platform;
            }
            if (
              input.value !== undefined ||
              input.type !== undefined ||
              written.value !== existing.value
            ) {
              patch.value = written.value;
            }
          }
          if (input.status !== undefined) patch.status = input.status;
          if (input.confidence !== undefined) {
            patch.confidence = input.confidence;
          }
          if (input.notes !== undefined) {
            patch.notes = trimmedOrNull(input.notes);
          }

          // An Evidence-only update (no Identifier column) writes no row and signals nothing, so
          // no entry can outlive a concurrently deleted subject; the row was locked at the
          // checked version above. Any other update is the version check (`WHERE id AND version`)
          // unless Evidence was replaced, when the lock already is.
          if (Object.keys(patch).length === 0) {
            const settledOnly = yield* tryDb(() =>
              identifiersRepo.getInCase(tx, scopedCaseId, identifierId)
            ).pipe(requireWritten("read Identifier back"));
            return { row: settledOnly, evidenceIds: nextIds };
          }
          const updated = yield* tryDb(() =>
            identifiersRepo.updateInCase(
              tx,
              scopedCaseId,
              identifierId,
              patch,
              input.evidenceIds === undefined
                ? input.expectedVersion
                : undefined
            )
          );
          if (!updated) return yield* missedVersion();
          const settled = yield* tryDb(() =>
            identifiersRepo.getInCase(tx, scopedCaseId, identifierId)
          ).pipe(requireWritten("read Identifier back"));
          yield* appendGraphActivityEffect(tx, {
            ...graphActorFields(input),
            caseId: scopedCaseId,
            kind: "identifier",
            action: "updated",
            subjectId: settled.id,
            label: settled.value,
          });
          return { row: settled, evidenceIds: nextIds };
        }),
      { uniqueIndex: NATURAL_KEY_INDEX, conflictReason: DUPLICATE_MESSAGE }
    );

    return toRecord(row, nextEvidenceIds);
  });
}

export function deleteIdentifierEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  identifierId: string,
  actor?: GraphActor
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* deleteIdentifierGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedIdentifierId = yield* requireTrimmedGraphId(
      identifierId,
      "Identifier"
    );
    const existing = yield* tryDbWith((exec) =>
      identifiersRepo.getInCase(exec, scopedCaseId, normalizedIdentifierId)
    );
    if (!existing) {
      return yield* new NotFoundError({
        entity: "Identifier",
        id: normalizedIdentifierId,
      });
    }

    yield* transact((tx) =>
      Effect.gen(function* deleteIdentifierTx() {
        yield* setHistoryContextEffect(tx, dossierHistory(actor));
        const deleted = yield* tryDb(() =>
          identifiersRepo.deleteInCase(tx, scopedCaseId, normalizedIdentifierId)
        );
        if (!deleted) {
          return yield* new NotFoundError({
            entity: "Identifier",
            id: normalizedIdentifierId,
          });
        }
        yield* appendGraphActivityEffect(tx, {
          ...graphActorFields(actor),
          caseId: scopedCaseId,
          kind: "identifier",
          action: "deleted",
          subjectId: normalizedIdentifierId,
          label: deleted.value,
        });
      })
    );
  });
}
