import { Data, Effect } from "effect";

import {
  CLAIM_CLASSES,
  EDGE_PREDICATES,
  ENTITY_KINDS,
  IDENTIFIER_STATUSES,
  IDENTIFIER_TYPES,
  parseGraphUuidList,
  entitySlugSchema,
  trimmedUuidSchema,
  validateIdentifierWrite,
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

/** Trim + validate a UUID field on patch op data. */
export function requireUuid(
  data: Record<string, JsonValue>,
  key: string
): string {
  const v = data[key];
  if (typeof v !== "string" || !v.trim()) {
    throw new CustodyViolation({ reason: `${key} is required` });
  }
  const parsed = trimmedUuidSchema.safeParse(v);
  if (!parsed.success) {
    throw new CustodyViolation({ reason: `${key} must be a valid UUID` });
  }
  return parsed.data;
}

/** Trim + slugify an entity/case slug on patch op data. */
export function requireEntitySlug(data: Record<string, JsonValue>): string {
  const raw = requireString(data, "slug");
  const parsed = entitySlugSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CustodyViolation({ reason: "entity slug is required" });
  }
  return parsed.data;
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
  const normalized = value.toLowerCase();
  if (isOneOf(normalized, allowed)) {
    return normalized;
  }
  throw new CustodyViolation({ reason: `Invalid ${label}: ${value}` });
}

function assertClaimOpShape(op: PatchOp): void {
  if (op.resource !== "claim" || op.op !== "create") {
    throw new CustodyViolation({ reason: "claim only supports create" });
  }
  requireUuid(op.data, "entityId");
  requireString(op.data, "text");
  if ("class" in op.data) {
    requireEnum(requireString(op.data, "class"), CLAIM_CLASSES, "claim class");
  }
}

function assertEventOpShape(op: PatchOp): void {
  if (op.resource !== "event" || op.op !== "create") {
    throw new CustodyViolation({ reason: "event only supports create" });
  }
  requireUuid(op.data, "entityId");
  requireString(op.data, "when");
  requireString(op.data, "what");
}

function assertQuestionOpShape(op: PatchOp): void {
  if (op.resource !== "question" || op.op !== "create") {
    throw new CustodyViolation({ reason: "question only supports create" });
  }
  requireUuid(op.data, "entityId");
  requireString(op.data, "text");
}

function isNullableStringField(
  data: Record<string, unknown>,
  key: string
): boolean {
  if (!(key in data)) return false;
  const value = data[key];
  return value === null || typeof value === "string";
}

const ENTITY_CREATE_FIELDS = new Set([
  "kind",
  "name",
  "slug",
  "summary",
  "notes",
]);
const ENTITY_UPDATE_FIELDS = new Set(["name", "summary", "notes"]);

function assertEntityNullableTextField(
  data: Record<string, unknown>,
  key: "summary" | "notes"
): void {
  if (key in data && !isNullableStringField(data, key)) {
    throw new CustodyViolation({
      reason: `entity ${key} must be a string or null`,
    });
  }
}

function assertEntityOpShape(op: PatchOp): void {
  if (op.resource !== "entity") {
    throw new CustodyViolation({ reason: "expected entity patch op" });
  }
  if (op.op === "create" || op.op === "upsert") {
    for (const key of Object.keys(op.data)) {
      if (!ENTITY_CREATE_FIELDS.has(key)) {
        throw new CustodyViolation({
          reason: `entity create does not support field: ${key}`,
        });
      }
    }
    requireEnum(requireString(op.data, "kind"), ENTITY_KINDS, "entity kind");
    requireString(op.data, "name");
    requireEntitySlug(op.data);
    assertEntityNullableTextField(op.data, "summary");
    assertEntityNullableTextField(op.data, "notes");
    return;
  }
  if (op.op === "update") {
    for (const key of Object.keys(op.data)) {
      if (!ENTITY_UPDATE_FIELDS.has(key)) {
        throw new CustodyViolation({
          reason: `entity update does not support field: ${key}`,
        });
      }
    }
    const hasName =
      typeof op.data.name === "string" && op.data.name.trim() !== "";
    const hasSummary = isNullableStringField(op.data, "summary");
    const hasNotes = isNullableStringField(op.data, "notes");
    if ("summary" in op.data && !hasSummary) {
      throw new CustodyViolation({
        reason: "entity summary must be a string or null",
      });
    }
    if ("notes" in op.data && !hasNotes) {
      throw new CustodyViolation({
        reason: "entity notes must be a string or null",
      });
    }
    if ("name" in op.data && typeof op.data.name !== "string") {
      throw new CustodyViolation({
        reason: "entity name must be a string",
      });
    }
    if (!hasName && !hasSummary && !hasNotes) {
      throw new CustodyViolation({
        reason: "entity update requires at least one field",
      });
    }
    return;
  }
  throw new CustodyViolation({
    reason: `entity does not support op: ${JSON.stringify(op.op)}`,
  });
}

function assertIdentifierOpStructure(op: PatchOp): void {
  if (op.resource !== "identifier") {
    throw new CustodyViolation({ reason: "expected identifier patch op" });
  }
  if (op.op !== "create" && op.op !== "upsert") {
    throw new CustodyViolation({ reason: "identifier supports create/upsert" });
  }
  requireUuid(op.data, "entityId");
  requireEnum(
    requireString(op.data, "type"),
    IDENTIFIER_TYPES,
    "identifier type"
  );
  requireString(op.data, "value");
  if ("status" in op.data) {
    requireEnum(
      requireString(op.data, "status"),
      IDENTIFIER_STATUSES,
      "identifier status"
    );
  }
}

function assertIdentifierOpShape(op: PatchOp): void {
  assertIdentifierOpStructure(op);
}

function assertIdentifierWriteGate(op: PatchOp): void {
  if (op.resource !== "identifier") return;
  if (op.op !== "create" && op.op !== "upsert") return;

  const type = requireEnum(
    requireString(op.data, "type"),
    IDENTIFIER_TYPES,
    "identifier type"
  );
  const value = requireString(op.data, "value");
  const platform = typeof op.data.platform === "string" ? op.data.platform : "";
  const written = validateIdentifierWrite({ type, value, platform });
  if (!written.ok) {
    throw new CustodyViolation({ reason: written.message });
  }
}

function assertEdgeOpShape(op: PatchOp): void {
  if (op.resource !== "edge") {
    throw new CustodyViolation({ reason: "expected edge patch op" });
  }
  if (op.op !== "create" && op.op !== "upsert") {
    throw new CustodyViolation({ reason: "edge supports create/upsert" });
  }
  const fromId = requireUuid(op.data, "fromId");
  const toId = requireUuid(op.data, "toId");
  if (fromId === toId) {
    throw new CustodyViolation({
      reason: "Edge cannot link an Entity to itself",
    });
  }
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

function assertNoSmuggledConfidence(op: PatchOp): void {
  if ("confidence" in op.data) {
    throw new CustodyViolation({
      reason:
        "op.data.confidence is forbidden — confidence is chosen at Inbox Accept",
    });
  }
}

function assertOpId(op: PatchOp): void {
  const parsed = trimmedUuidSchema.safeParse(op.id);
  if (!parsed.success) {
    throw new CustodyViolation({
      reason: "patch op id must be a valid UUID",
    });
  }
}

function assertOpShape(op: PatchOp): void {
  assertOpId(op);
  assertNoSmuggledConfidence(op);
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
 * Shape-only validation (resource/op/required fields). No confidence gate and
 * no identifier value write gate — caps may propose imprecise identifier ops;
 * `assertPatchGates` enforces `validateIdentifierWrite` at Accept / apply time.
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
  return Effect.gen(function* assertPatchGatesGen() {
    yield* runGate(() => {
      if (patchNeedsConfidence(patch) && !opts.confidence) {
        throw new CustodyViolation({
          reason: "confidence is required for this Proposal",
        });
      }
      if (opts.confidence === "confirmed") {
        let anyEvidence = false;
        for (const op of patch) {
          const raw = op.evidenceIds ?? [];
          const hasNonEmpty = raw.some(
            (id) => typeof id === "string" && id.trim() !== ""
          );
          if (!hasNonEmpty) continue;
          const parsed = parseGraphUuidList(raw);
          if (parsed === null) {
            throw new CustodyViolation({
              reason: "patch op evidenceIds contains an invalid UUID",
            });
          }
          if (parsed.length > 0) anyEvidence = true;
        }
        const sharedParsed = parseGraphUuidList(opts.sharedEvidenceIds ?? []);
        if (
          sharedParsed === null &&
          (opts.sharedEvidenceIds ?? []).some(
            (id) => typeof id === "string" && id.trim() !== ""
          )
        ) {
          throw new CustodyViolation({
            reason: "sharedEvidenceIds contains an invalid UUID",
          });
        }
        const shared = (sharedParsed ?? []).length > 0;
        if (!anyEvidence && !shared) {
          throw new CustodyViolation({
            reason: "confirmed requires at least one Evidence attachment",
          });
        }
      }
    });
    yield* runGate(() => {
      for (const op of patch) {
        assertIdentifierWriteGate(op);
      }
    });
    yield* assertPatchShape(patch);
  });
}
