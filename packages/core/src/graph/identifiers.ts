import { Effect } from "effect";

import type {
  IdentifierListRow,
  IdentifierPatch,
  IdentifierRow,
} from "@watchdog/db";
import { validateIdentifierWrite } from "@watchdog/schemas/graph";
import type {
  CaseId,
  ConfidenceTier,
  EntityKind,
  IdentifierStatus,
  IdentifierType,
  OrganizationId,
  GraphActor,
} from "@watchdog/schemas/shared";
import { trimmedOrNull } from "@watchdog/schemas/shared";

import { parseGraphEvidenceIdsEffect } from "../evidence/evidence";
import type { Db } from "../infra/db-service";
import { InvalidError, type DomainTag } from "../infra/tagged-errors";
import { dossierChannel } from "./graph-activity";
import { runGraphMutation } from "./mutation/run-graph-mutation";
import {
  identifiersTable,
  toIdentifierRecord,
  type IdentifierRecord,
} from "./mutation/tables";
import {
  assertConfidenceEvidenceEffect,
  assertEntityInCaseEffect,
  requireTrimmedGraphId,
} from "./patch/guards";

export type { IdentifierRecord };

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

/** Identifier plus its owning Entity's labels: a row of the Identifier list. */
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
    ...toIdentifierRecord(row, evidenceIds),
    entityName: row.entityName,
    entitySlug: row.entitySlug,
    entityKind: row.entityKind,
    entitySummary: row.entitySummary,
    entityNotes: row.entityNotes,
  };
}

export function createIdentifierEffect(
  input: CreateIdentifierInput
): Effect.Effect<IdentifierRecord, DomainTag, Db> {
  return runGraphMutation(
    {
      caseId: input.caseId,
      organizationId: input.organizationId,
      actor: input,
      channel: dossierChannel(input),
    },
    (w) =>
      Effect.gen(function* createIdentifierGen() {
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
        yield* assertEntityInCaseEffect(w.caseId, entityId, w.tx);
        return yield* w.insert(
          identifiersTable,
          {
            entityId,
            type,
            platform,
            value,
            confidence: input.confidence,
            status: input.status,
            notes: trimmedOrNull(input.notes),
          },
          { evidence: evidenceIds }
        );
      })
  );
}

/** The columns an update changes: the identifier rules (type, value and platform normalise together). */
function identifierPatch(
  input: UpdateIdentifierInput,
  existing: IdentifierRow
): Effect.Effect<IdentifierPatch, DomainTag> {
  return Effect.gen(function* identifierPatchGen() {
    const patch: IdentifierPatch = {};
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
      if (input.platform !== undefined) patch.platform = written.platform;
      if (
        input.value !== undefined ||
        input.type !== undefined ||
        written.value !== existing.value
      ) {
        patch.value = written.value;
      }
    }
    if (input.status !== undefined) patch.status = input.status;
    if (input.confidence !== undefined) patch.confidence = input.confidence;
    if (input.notes !== undefined) patch.notes = trimmedOrNull(input.notes);
    return patch;
  });
}

export function updateIdentifierEffect(
  input: UpdateIdentifierInput
): Effect.Effect<IdentifierRecord, DomainTag, Db> {
  return runGraphMutation(
    {
      caseId: input.caseId,
      organizationId: input.organizationId,
      actor: input,
      channel: dossierChannel(input),
    },
    (w) =>
      Effect.gen(function* updateIdentifierGen() {
        const existing = yield* w.get(identifiersTable, input.identifierId);
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
        const patch = yield* identifierPatch(input, existing);
        // An Evidence-only edit has an empty patch; the module still touches the row and appends `updated`.
        const updated = yield* w.update(identifiersTable, existing.id, patch, {
          expectedVersion: input.expectedVersion,
          ...(input.evidenceIds === undefined
            ? {}
            : { evidence: input.evidenceIds }),
        });
        // The policy reads the Evidence the Identifier now has; a violation rolls the edit back.
        yield* assertConfidenceEvidenceEffect(
          updated.confidence,
          updated.evidenceIds
        );
        return updated;
      })
  );
}

export function deleteIdentifierEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  identifierId: string,
  actor?: GraphActor
): Effect.Effect<void, DomainTag, Db> {
  return runGraphMutation(
    {
      caseId,
      organizationId,
      actor,
      channel: dossierChannel(actor),
    },
    (w) => w.remove(identifiersTable, identifierId).pipe(Effect.asVoid)
  );
}
