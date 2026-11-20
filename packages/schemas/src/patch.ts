import { z } from "zod";

import {
  CLAIM_CLASS_LABELS,
  ENTITY_KIND_LABELS,
  IDENTIFIER_STATUS_LABELS,
  IDENTIFIER_TYPE_LABELS,
} from "./display-labels";
import {
  optionalClaimClassSchema,
  optionalIdentifierStatusSchema,
  trimmedEdgePredicateSchema,
  trimmedEntityKindSchema,
  trimmedIdentifierTypeSchema,
} from "./enums";
import { ARRAY_MAX, NAME_MAX, NOTES_MAX, URL_MAX } from "./limits";
import { identifierPlatformSearchHaystack } from "./platforms";
import {
  entitySlugSchema,
  expectedVersionSchema,
  nullableTextPatch,
  optionalText,
  parseTrimmedUuid,
  requiredText,
  trimmedOrUndefined,
  trimmedUuidSchema,
  uuidListSchema,
} from "./primitives";
import {
  edgeRelatedToHasNotes,
  entityDisplayLabel,
  predicateLabel,
} from "./vocab";

const CONFIDENCE_IN_DATA =
  "op.data.confidence is forbidden — confidence is chosen at Inbox Accept";

/**
 * A patch op's `data`: a strict object, so a field the op does not take (a `confidence`, which
 * is chosen at Accept, or a typo) refuses the op where it is created.
 */
function opData<S extends z.core.$ZodLooseShape>(shape: S) {
  return z.strictObject(shape, {
    error: (issue) =>
      issue.code === "unrecognized_keys" && issue.keys.includes("confidence")
        ? CONFIDENCE_IN_DATA
        : undefined,
  });
}

/** Optional text that may be cleared: blank reads as `null`, an absent key stays absent. */
const nullableText = (max: number) => nullableTextPatch(max).optional();

const claimData = opData({
  entityId: trimmedUuidSchema,
  text: requiredText(NOTES_MAX),
  /** Omitted: `observation`. */
  class: optionalClaimClassSchema,
});

const eventData = opData({
  entityId: trimmedUuidSchema,
  when: requiredText(NAME_MAX),
  what: requiredText(NOTES_MAX),
  where: nullableText(NAME_MAX),
});

const questionData = opData({
  entityId: trimmedUuidSchema,
  text: requiredText(NOTES_MAX),
});

const entityWriteData = opData({
  kind: trimmedEntityKindSchema,
  name: requiredText(NAME_MAX),
  slug: entitySlugSchema,
  summary: nullableText(NOTES_MAX),
  notes: nullableText(NOTES_MAX),
});

const entityUpdateData = opData({
  name: requiredText(NAME_MAX).optional(),
  summary: nullableText(NOTES_MAX),
  notes: nullableText(NOTES_MAX),
}).refine(
  (data) =>
    data.name !== undefined ||
    data.summary !== undefined ||
    data.notes !== undefined,
  { message: "entity update requires at least one field" }
);

const identifierData = opData({
  entityId: trimmedUuidSchema,
  type: trimmedIdentifierTypeSchema,
  value: requiredText(URL_MAX),
  platform: optionalText(NAME_MAX),
  /** Omitted: `unknown`. */
  status: optionalIdentifierStatusSchema,
  notes: nullableText(NOTES_MAX),
});

const edgeData = opData({
  fromId: trimmedUuidSchema,
  toId: trimmedUuidSchema,
  predicate: trimmedEdgePredicateSchema,
  notes: nullableText(NOTES_MAX),
})
  .refine((data) => data.fromId !== data.toId, {
    message: "Edge cannot link an Entity to itself",
    path: ["toId"],
  })
  .refine(edgeRelatedToHasNotes, {
    message: "related_to requires notes",
    path: ["notes"],
  });

/** An op that creates a row: its `id` is the new row's. */
function createOp<K extends string, D extends z.ZodType>(kind: K, data: D) {
  return z.strictObject({
    kind: z.literal(kind),
    id: trimmedUuidSchema,
    data,
    evidenceIds: uuidListSchema.optional(),
  });
}

/**
 * An op that may change an existing row (an `update`, or an `upsert` that lands on one). It may
 * carry the `version` of that row as the writer last read it (#307): the op then fails with
 * `stale_version` (the whole patch rolls back) when the row has moved on; without it the op
 * overwrites the row as it stands.
 */
function writeOp<K extends string, D extends z.ZodType>(kind: K, data: D) {
  return createOp(kind, data).extend({
    expectedVersion: expectedVersionSchema.optional(),
  });
}

/**
 * A Graph patch op: one member per kind (`<resource>.<op>`), each with its own strict `data`.
 * Parsed once where a Proposal or graph write is created (the API input, a Cap's interpret
 * output, a CLI patch file), so a malformed op never reaches Triage. Confidence is chosen at
 * Accept, never in `data`.
 */
export const patchOpSchema = z.discriminatedUnion("kind", [
  createOp("entity.create", entityWriteData),
  writeOp("entity.upsert", entityWriteData),
  writeOp("entity.update", entityUpdateData),
  createOp("identifier.create", identifierData),
  writeOp("identifier.upsert", identifierData),
  createOp("edge.create", edgeData),
  writeOp("edge.upsert", edgeData),
  createOp("claim.create", claimData),
  createOp("event.create", eventData),
  createOp("question.create", questionData),
]);

export type PatchOp = z.output<typeof patchOpSchema>;
export type PatchOpKind = PatchOp["kind"];

/** Every op kind, read from the union (the one list). */
export const PATCH_OP_KINDS: readonly PatchOpKind[] = patchOpSchema.options.map(
  (member) => member.shape.kind.value
);

type SplitKind<K> = K extends `${infer R}.${infer V}` ? [R, V] : never;
export type PatchResource = SplitKind<PatchOpKind>[0];
export type PatchVerb = SplitKind<PatchOpKind>[1];

/** The ops of one resource (`PatchOpOf<"edge">`: `edge.create` and `edge.upsert`). */
export type PatchOpOf<R extends PatchResource> = Extract<
  PatchOp,
  { kind: `${R}.${string}` }
>;

/** Each kind's resource and verb, checked against the kind's own spelling. */
const KIND_PARTS: { readonly [K in PatchOpKind]: SplitKind<K> } = {
  "entity.create": ["entity", "create"],
  "entity.upsert": ["entity", "upsert"],
  "entity.update": ["entity", "update"],
  "identifier.create": ["identifier", "create"],
  "identifier.upsert": ["identifier", "upsert"],
  "edge.create": ["edge", "create"],
  "edge.upsert": ["edge", "upsert"],
  "claim.create": ["claim", "create"],
  "event.create": ["event", "create"],
  "question.create": ["question", "create"],
};

/** The resource an op writes (`edge.upsert` → `edge`). */
export function patchOpResource(op: Pick<PatchOp, "kind">): PatchResource {
  return KIND_PARTS[op.kind][0];
}

/** What an op does to its resource (`edge.upsert` → `upsert`). */
export function patchOpVerb(op: Pick<PatchOp, "kind">): PatchVerb {
  return KIND_PARTS[op.kind][1];
}

/** Whether `op` writes `resource`; narrows to that resource's ops. */
export function isPatchOpOf<R extends PatchResource>(
  op: PatchOp,
  resource: R
): op is PatchOpOf<R> {
  return patchOpResource(op) === resource;
}

/** Resources where confidence is chosen at Accept — never in op.data. */
export const CONFIDENCE_GATED_RESOURCES: ReadonlySet<PatchResource> =
  new Set<PatchResource>(["claim", "identifier", "edge"]);

/**
 * A patch as it is stored, returned and read from a Cap's interpret output: no maximum op
 * count, so a Cap that proposes many ops still lands one Proposal.
 */
export const patchSchema = z.array(patchOpSchema);

/** The patch of an input (Proposal create, graph write, CLI patch file). */
export const patchInputSchema = z.array(patchOpSchema).max(ARRAY_MAX);

/** The data of `op` read by field name, for helpers that look across kinds. */
function fieldsOf(op: PatchOp): Readonly<Record<string, unknown>> {
  return op.data;
}

export function patchOpEntityId(op: PatchOp): string | undefined {
  const value = fieldsOf(op).entityId;
  if (typeof value !== "string") return undefined;
  return parseTrimmedUuid(value) ?? undefined;
}

function pushRelatedEntityId(ids: string[], raw: unknown): void {
  if (typeof raw !== "string") return;
  const id = parseTrimmedUuid(raw);
  if (id !== null) ids.push(id);
}

/** Display label from an entity patch op body (create/update), when name or slug is present. */
export function patchEntityOpDisplayLabel(op: PatchOp): string | null {
  if (!isPatchOpOf(op, "entity")) return null;
  const data = fieldsOf(op);
  const name = typeof data.name === "string" ? data.name : "";
  const slug = typeof data.slug === "string" ? data.slug : "";
  const label = entityDisplayLabel({ name, slug });
  return label === "" ? null : label;
}

/** Entity ids cited by a patch op (entity op id, entityId, edge fromId/toId). */
export function patchOpRelatedEntityIds(op: PatchOp): string[] {
  const ids: string[] = [];
  if (isPatchOpOf(op, "entity")) {
    pushRelatedEntityId(ids, op.id);
  }
  const data = fieldsOf(op);
  for (const key of ["entityId", "fromId", "toId"] as const) {
    pushRelatedEntityId(ids, data[key]);
  }
  return ids;
}

export function patchOpText(op: PatchOp): string | undefined {
  const value = fieldsOf(op).text;
  return typeof value === "string" ? trimmedOrUndefined(value) : undefined;
}

function appendPatchFieldSearchText(
  parts: string[],
  key: string,
  field: string,
  resource: PatchResource
): void {
  if (key === "platform" && resource === "identifier") {
    parts.push(identifierPlatformSearchHaystack(field));
    return;
  }
  parts.push(field);
  const entityLabels: Record<string, string> = ENTITY_KIND_LABELS;
  const identifierTypeLabels: Record<string, string> = IDENTIFIER_TYPE_LABELS;
  const claimClassLabels: Record<string, string> = CLAIM_CLASS_LABELS;
  const identifierStatusLabels: Record<string, string> =
    IDENTIFIER_STATUS_LABELS;
  if (key === "kind" && resource === "entity") {
    const label = entityLabels[field];
    if (label !== undefined) parts.push(label);
  } else if (key === "type" && resource === "identifier") {
    const label = identifierTypeLabels[field];
    if (label !== undefined) parts.push(label);
  } else if (key === "class" && resource === "claim") {
    const label = claimClassLabels[field];
    if (label !== undefined) parts.push(label);
  } else if (key === "status" && resource === "identifier") {
    const label = identifierStatusLabels[field];
    if (label !== undefined) parts.push(label);
  }
}

/** Searchable text from patch op bodies (claim text, identifier values, edge notes, …). */
export function patchOpSearchText(op: PatchOp): string {
  const parts: string[] = [];
  const text = patchOpText(op);
  if (text) parts.push(text);
  const data = fieldsOf(op);
  const resource = patchOpResource(op);
  for (const key of [
    "value",
    "notes",
    "what",
    "when",
    "where",
    "name",
    "slug",
    "summary",
    "platform",
    "kind",
    "type",
    "class",
    "status",
  ] as const) {
    const field = data[key];
    if (typeof field === "string" && field.trim() !== "") {
      appendPatchFieldSearchText(parts, key, field, resource);
    }
  }
  if (isPatchOpOf(op, "edge")) {
    parts.push(op.data.predicate, predicateLabel(op.data.predicate));
  }
  return parts.join(" ");
}

const PATCH_OP_VERB_LABELS: Record<PatchVerb, string> = {
  create: "Create",
  upsert: "Upsert",
  update: "Update",
};

const PATCH_RESOURCE_LABELS: Record<PatchResource, string> = {
  claim: "Claim",
  identifier: "Identifier",
  edge: "Connection",
  entity: "Entity",
  event: "Event",
  question: "Question",
};

/** Human verb for a patch op (`create` → `Create`). */
export function patchOpVerbLabel(verb: PatchVerb): string {
  return PATCH_OP_VERB_LABELS[verb];
}

/** Human noun for a patch resource (`edge` → `Connection`). */
export function patchResourceLabel(resource: PatchResource): string {
  return PATCH_RESOURCE_LABELS[resource];
}

/** One-line headline for a single patch op (`Create Claim`). */
export function patchOpHeadline(op: PatchOp): string {
  return `${patchOpVerbLabel(patchOpVerb(op))} ${patchResourceLabel(patchOpResource(op))}`;
}
