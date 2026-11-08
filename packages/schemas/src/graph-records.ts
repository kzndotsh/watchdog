import { z } from "zod";

import {
  claimClassSchema,
  confidenceTierSchema,
  edgePredicateSchema,
  entityKindSchema,
  identifierStatusSchema,
  identifierTypeSchema,
  questionStatusSchema,
  retractKindSchema,
} from "./enums";
import { caseIdSchema } from "./ids";
import { listPageSchema } from "./lists/list-page";

export const entitySchema = z.object({
  id: z.uuid(),
  caseId: caseIdSchema,
  kind: entityKindSchema,
  name: z.string(),
  slug: z.string(),
  summary: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: z.number().int().positive(),
});

export const claimSchema = z.object({
  id: z.uuid(),
  entityId: z.uuid(),
  class: claimClassSchema,
  text: z.string(),
  confidence: confidenceTierSchema,
  retracted: z.boolean(),
  retractKind: retractKindSchema.nullable(),
  retractedReason: z.string().nullable(),
  retractedBy: z.string().nullable(),
  retractedAt: z.string().nullable(),
  evidenceIds: z.array(z.uuid()),
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: z.number().int().positive(),
});

export const identifierSchema = z.object({
  id: z.uuid(),
  entityId: z.uuid(),
  type: identifierTypeSchema,
  platform: z.string(),
  value: z.string(),
  confidence: confidenceTierSchema,
  status: identifierStatusSchema,
  notes: z.string().nullable(),
  evidenceIds: z.array(z.uuid()),
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** A row of the Identifier list: the Identifier with its owning Entity's labels. */
export const caseIdentifierSchema = identifierSchema.extend({
  entityName: z.string(),
  entitySlug: z.string(),
  entityKind: entityKindSchema,
});

export const edgeSchema = z.object({
  id: z.uuid(),
  fromId: z.uuid(),
  toId: z.uuid(),
  predicate: edgePredicateSchema,
  confidence: confidenceTierSchema,
  notes: z.string().nullable(),
  evidenceIds: z.array(z.uuid()),
  peerId: z.uuid(),
  peerName: z.string(),
  peerSlug: z.string(),
  peerKind: entityKindSchema,
  direction: z.enum(["out", "in"]),
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: z.number().int().positive(),
});

/**
 * A row of the Entity list: the Entity with its Connection counts, and its one Connection (an
 * Edge seen from it, without Evidence links) when it has exactly one; null otherwise.
 */
export const entityListItemSchema = entitySchema.extend({
  connections: z.object({
    outgoing: z.number().int().min(0),
    incoming: z.number().int().min(0),
  }),
  soleConnection: edgeSchema.omit({ evidenceIds: true }).nullable(),
});

/**
 * A row of the Connection list (`edgeList`): the Connection with both ends' labels (absolute
 * endpoints, no peer or direction: an Entity's tab orients it).
 */
export const caseEdgeSchema = z.object({
  id: z.uuid(),
  fromId: z.uuid(),
  fromName: z.string(),
  fromSlug: z.string(),
  fromKind: entityKindSchema,
  toId: z.uuid(),
  toName: z.string(),
  toSlug: z.string(),
  toKind: entityKindSchema,
  predicate: edgePredicateSchema,
  confidence: confidenceTierSchema,
  notes: z.string().nullable(),
  evidenceIds: z.array(z.uuid()),
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: z.number().int().positive(),
});

export const eventSchema = z.object({
  id: z.uuid(),
  entityId: z.uuid(),
  when: z.string(),
  what: z.string(),
  where: z.string().nullable(),
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: z.number().int().positive(),
});

export const questionSchema = z.object({
  id: z.uuid(),
  entityId: z.uuid(),
  text: z.string(),
  status: questionStatusSchema,
  resolvedNote: z.string().nullable(),
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: z.number().int().positive(),
});

/* Declared lists (ADR-0007): a page plus `total` on the first page. */
export const entityListPageSchema = listPageSchema(entityListItemSchema);
export const identifierListPageSchema = listPageSchema(caseIdentifierSchema);
export const claimListPageSchema = listPageSchema(claimSchema);
export const eventListPageSchema = listPageSchema(eventSchema);
export const questionListPageSchema = listPageSchema(questionSchema);
export const edgeListPageSchema = listPageSchema(caseEdgeSchema);
