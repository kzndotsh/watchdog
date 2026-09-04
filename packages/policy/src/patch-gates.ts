import { Data, Effect } from "effect";

import {
  CLAIM_CLASSES,
  EDGE_PREDICATES,
  ENTITY_KINDS,
  IDENTIFIER_STATUSES,
  IDENTIFIER_TYPES,
  type ConfidenceTier,
  type JsonValue,
  type PatchOp,
} from "@watchdog/schemas";

import { patchNeedsConfidence } from "./patch-needs-confidence";

export class CustodyViolation extends Data.TaggedError("CustodyViolation")<{
  readonly reason: string;
}> {}

export interface PatchGateOpts {
  confidence?: ConfidenceTier;
  sharedEvidenceIds?: string[];
}

export function requireString(
  data: Record<string, JsonValue>,
  key: string
): string {
  const v = data[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new CustodyViolation({ reason: `${key} is required` });
  }
  return v.trim();
}

export function isOneOf<T extends string>(
  value: string,
  allowed: readonly T[]
): value is T {
  const widened: readonly string[] = allowed;
  return widened.includes(value);
}

export function requireEnum<T extends string>(
  value: string,
  allowed: readonly T[],
  label: string
): T {
  if (isOneOf(value, allowed)) {
    return value;
  }
  throw new CustodyViolation({ reason: `Invalid ${label}: ${value}` });
}

function assertClaimOpShape(op: PatchOp): void {
  if (op.resource !== "claim" || op.op !== "create") {
    throw new CustodyViolation({ reason: "claim only supports create" });
  }
  requireString(op.data, "entityId");
  requireString(op.data, "text");
  if (typeof op.data.class === "string") {
    requireEnum(op.data.class, CLAIM_CLASSES, "claim class");
  }
}

function assertEventOpShape(op: PatchOp): void {
  if (op.resource !== "event" || op.op !== "create") {
    throw new CustodyViolation({ reason: "event only supports create" });
  }
  requireString(op.data, "entityId");
  requireString(op.data, "when");
  requireString(op.data, "what");
}

function assertQuestionOpShape(op: PatchOp): void {
  if (op.resource !== "question" || op.op !== "create") {
    throw new CustodyViolation({ reason: "question only supports create" });
  }
  requireString(op.data, "entityId");
  requireString(op.data, "text");
}

function assertEntityOpShape(op: PatchOp): void {
  if (op.resource !== "entity") return;
  if (op.op === "create" || op.op === "upsert") {
    requireEnum(requireString(op.data, "kind"), ENTITY_KINDS, "entity kind");
    requireString(op.data, "name");
    requireString(op.data, "slug");
    return;
  }
  if (op.op === "update") return;
  throw new CustodyViolation({
    reason: `entity does not support op: ${JSON.stringify(op.op)}`,
  });
}

function assertIdentifierOpShape(op: PatchOp): void {
  if (op.resource !== "identifier") return;
  if (op.op !== "create" && op.op !== "upsert") {
    throw new CustodyViolation({ reason: "identifier supports create/upsert" });
  }
  requireString(op.data, "entityId");
  requireEnum(
    requireString(op.data, "type"),
    IDENTIFIER_TYPES,
    "identifier type"
  );
  requireString(op.data, "value");
  if (typeof op.data.status === "string") {
    requireEnum(op.data.status, IDENTIFIER_STATUSES, "identifier status");
  }
}

function assertEdgeOpShape(op: PatchOp): void {
  if (op.resource !== "edge") return;
  if (op.op !== "create" && op.op !== "upsert") {
    throw new CustodyViolation({ reason: "edge supports create/upsert" });
  }
  requireString(op.data, "fromId");
  requireString(op.data, "toId");
  const predicate = requireEnum(
    requireString(op.data, "predicate"),
    EDGE_PREDICATES,
    "edge predicate"
  );
  const notes = typeof op.data.notes === "string" ? op.data.notes : null;
  if (predicate === "related_to" && (notes === null || notes.trim() === "")) {
    throw new CustodyViolation({ reason: "related_to requires notes" });
  }
}

const OP_SHAPE_ASSERTERS: Record<PatchOp["resource"], (op: PatchOp) => void> = {
  claim: assertClaimOpShape,
  event: assertEventOpShape,
  question: assertQuestionOpShape,
  entity: assertEntityOpShape,
  identifier: assertIdentifierOpShape,
  edge: assertEdgeOpShape,
};

function assertOpShape(op: PatchOp): void {
  OP_SHAPE_ASSERTERS[op.resource](op);
}

function runGate(body: () => void): Effect.Effect<void, CustodyViolation> {
  return Effect.try({
    try: body,
    catch: (error) => {
      if (error instanceof CustodyViolation) {
        return error;
      }
      return new CustodyViolation({
        reason: error instanceof Error ? error.message : String(error),
      });
    },
  });
}

/**
 * Shape-only validation (resource/op/required fields). No confidence gate —
 * use for propose (no confidence yet) and before applyPatch's full gates.
 */
export function assertPatchShape(
  patch: PatchOp[]
): Effect.Effect<void, CustodyViolation> {
  return runGate(() => {
    for (const op of patch) {
      assertOpShape(op);
    }
  });
}

/**
 * Pure Accept policies — no DB. Call before applying PatchOps so machines and
 * UI can fail closed without a Postgres round-trip.
 */
export function assertPatchGates(
  patch: PatchOp[],
  opts: PatchGateOpts = {}
): Effect.Effect<void, CustodyViolation> {
  return runGate(() => {
    if (patchNeedsConfidence(patch) && !opts.confidence) {
      throw new CustodyViolation({
        reason: "confidence is required for this Proposal",
      });
    }
    if (opts.confidence === "confirmed") {
      const anyEvidence = patch.some((op) => (op.evidenceIds?.length ?? 0) > 0);
      const shared = (opts.sharedEvidenceIds?.length ?? 0) > 0;
      if (!anyEvidence && !shared) {
        throw new CustodyViolation({
          reason: "confirmed requires at least one Evidence attachment",
        });
      }
    }

    for (const op of patch) {
      assertOpShape(op);
    }
  });
}
