import { z } from "zod";

import {
  CLAIM_CLASS_LABELS,
  ENTITY_KIND_LABELS,
  IDENTIFIER_STATUS_LABELS,
  IDENTIFIER_TYPE_LABELS,
} from "./display-labels";
import type { JsonObject } from "./json";
import { identifierPlatformSearchHaystack } from "./platforms";
import {
  jsonObjectSchema,
  parseTrimmedCaseId,
  trimmedOrUndefined,
  trimmedUuidSchema,
  uuidListSchema,
} from "./primitives";
import { entityDisplayLabel, predicateLabel } from "./vocab";

/** Graph patch op (confidence is chosen at Accept, never in data). */
export interface PatchOp {
  op: "create" | "upsert" | "update";
  resource: "entity" | "identifier" | "edge" | "claim" | "event" | "question";
  id: string;
  data: JsonObject;
  evidenceIds?: string[];
}

const resourceSchema = z.enum([
  "entity",
  "identifier",
  "edge",
  "claim",
  "event",
  "question",
]);

/** Resources where confidence is chosen at Accept — never in op.data. */
export const CONFIDENCE_GATED_RESOURCES = new Set([
  "claim",
  "identifier",
  "edge",
]);

export const patchOpSchema = z
  .object({
    op: z.enum(["create", "upsert", "update"]),
    resource: resourceSchema,
    id: trimmedUuidSchema,
    data: jsonObjectSchema,
    evidenceIds: uuidListSchema.optional(),
  })
  .superRefine((op, ctx) => {
    if ("confidence" in op.data) {
      ctx.addIssue({
        code: "custom",
        message:
          "op.data.confidence is forbidden — confidence is chosen at Inbox Accept",
        path: ["data", "confidence"],
      });
    }
  });

export const patchSchema = z.array(patchOpSchema);

export function patchOpEntityId(op: PatchOp): string | undefined {
  const value = op.data.entityId;
  if (typeof value !== "string") return undefined;
  return parseTrimmedCaseId(value) ?? undefined;
}

function pushRelatedEntityId(ids: string[], raw: unknown): void {
  if (typeof raw !== "string") return;
  const id = parseTrimmedCaseId(raw);
  if (id !== null) ids.push(id);
}

/** Display label from an entity patch op body (create/update), when name or slug is present. */
export function patchEntityOpDisplayLabel(op: PatchOp): string | null {
  if (op.resource !== "entity") return null;
  const name = typeof op.data.name === "string" ? op.data.name : "";
  const slug = typeof op.data.slug === "string" ? op.data.slug : "";
  const label = entityDisplayLabel({ name, slug });
  return label === "" ? null : label;
}

/** Entity ids cited by a patch op (entity op id, entityId, edge fromId/toId). */
export function patchOpRelatedEntityIds(op: PatchOp): string[] {
  const ids: string[] = [];
  if (op.resource === "entity") {
    pushRelatedEntityId(ids, op.id);
  }
  for (const key of ["entityId", "fromId", "toId"] as const) {
    pushRelatedEntityId(ids, op.data[key]);
  }
  return ids;
}

export function patchOpText(op: PatchOp): string | undefined {
  const value = op.data.text;
  return typeof value === "string" ? trimmedOrUndefined(value) : undefined;
}

function appendPatchFieldSearchText(
  parts: string[],
  key: string,
  field: string,
  resource: PatchOp["resource"]
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
  for (const key of [
    "value",
    "notes",
    "what",
    "when",
    "where",
    "name",
    "slug",
    "summary",
    "resolvedNote",
    "platform",
    "kind",
    "type",
    "class",
    "status",
  ] as const) {
    const field = op.data[key];
    if (typeof field === "string" && field.trim() !== "") {
      appendPatchFieldSearchText(parts, key, field, op.resource);
    }
  }
  if (op.resource === "edge") {
    const predicate = op.data.predicate;
    if (typeof predicate === "string" && predicate.trim() !== "") {
      parts.push(predicate, predicateLabel(predicate));
    }
  }
  return parts.join(" ");
}

const PATCH_OP_VERB_LABELS: Record<PatchOp["op"], string> = {
  create: "Create",
  upsert: "Upsert",
  update: "Update",
};

const PATCH_RESOURCE_LABELS: Record<PatchOp["resource"], string> = {
  claim: "Claim",
  identifier: "Identifier",
  edge: "Connection",
  entity: "Entity",
  event: "Event",
  question: "Question",
};

/** Human verb for a patch op (`create` → `Create`). */
export function patchOpVerbLabel(op: PatchOp["op"]): string {
  return PATCH_OP_VERB_LABELS[op];
}

/** Human noun for a patch resource (`edge` → `Connection`). */
export function patchResourceLabel(resource: PatchOp["resource"]): string {
  return PATCH_RESOURCE_LABELS[resource];
}

/** One-line headline for a single patch op (`Create Claim`). */
export function patchOpHeadline(op: PatchOp): string {
  return `${patchOpVerbLabel(op.op)} ${patchResourceLabel(op.resource)}`;
}
