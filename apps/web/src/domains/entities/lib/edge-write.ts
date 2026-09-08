import {
  createEdgeInputSchema,
  updateEdgeInputSchema,
  type CreateEdgeInput,
  type UpdateEdgeInput,
} from "@/domains/entities/edges/types";
import type {
  EdgeOrientation,
  EdgePredicate,
  ConfidenceTier,
} from "@watchdog/schemas";
import {
  parseTrimmedCaseId,
  resolveEdgeEndpoints,
  trimmedOrNull,
  trimmedOrUndefined,
} from "@watchdog/schemas";

/** Shared create/update core (table + dossier). */
export interface ConnectionWriteCore {
  peerId: string;
  predicate: EdgePredicate;
  orientation: EdgeOrientation;
  notes?: string;
}

function scopedPeerId(peerId: string): string {
  const scoped = parseTrimmedCaseId(peerId);
  if (scoped === null) {
    throw new Error("peerId must be a valid UUID");
  }
  return scoped;
}

export function buildCreateEdgeData(opts: {
  caseId: string;
  centerId: string;
  core: ConnectionWriteCore;
  confidence?: ConfidenceTier;
  evidenceIds?: string[];
}): CreateEdgeInput {
  const peerId = scopedPeerId(opts.core.peerId);
  const { fromId, toId } = resolveEdgeEndpoints({
    entityId: opts.centerId,
    peerId,
    predicate: opts.core.predicate,
    orientation: opts.core.orientation,
  });
  const notes = trimmedOrUndefined(opts.core.notes);
  return createEdgeInputSchema.parse({
    caseId: opts.caseId,
    fromId,
    toId,
    predicate: opts.core.predicate,
    confidence: opts.confidence ?? "unverified",
    viewEntityId: opts.centerId,
    ...(notes === undefined ? {} : { notes }),
    ...(opts.evidenceIds === undefined
      ? {}
      : { evidenceIds: opts.evidenceIds }),
  });
}

export function buildUpdateEdgeData(opts: {
  caseId: string;
  centerId: string;
  edgeId: string;
  core: ConnectionWriteCore;
  existing: { fromId: string; toId: string; peerId: string };
  confidence?: ConfidenceTier;
  evidenceIds?: string[];
}): UpdateEdgeInput {
  const peerId = scopedPeerId(opts.core.peerId);
  const { fromId, toId } = resolveEdgeEndpoints({
    entityId: opts.centerId,
    peerId,
    predicate: opts.core.predicate,
    orientation: opts.core.orientation,
    existing: opts.existing,
  });
  const patch: UpdateEdgeInput = {
    caseId: opts.caseId,
    edgeId: opts.edgeId,
    viewEntityId: opts.centerId,
    fromId,
    toId,
    predicate: opts.core.predicate,
  };
  if (opts.core.notes !== undefined) {
    patch.notes = trimmedOrNull(opts.core.notes);
  }
  if (opts.confidence !== undefined) {
    patch.confidence = opts.confidence;
  }
  if (opts.evidenceIds !== undefined) {
    patch.evidenceIds = opts.evidenceIds;
  }
  return updateEdgeInputSchema.parse(patch);
}

/** Compact table DTO (unverified, no evidence). */
export type CreateEntityConnectionInput = ConnectionWriteCore;

export interface UpdateEntityConnectionInput extends ConnectionWriteCore {
  edgeId: string;
  existingFromId: string;
  existingToId: string;
  /** Peer before this edit (for endpoint resolution). */
  existingPeerId: string;
}
