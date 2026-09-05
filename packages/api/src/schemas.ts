import { z } from "zod";

import {
  claimClassSchema,
  confidenceTierSchema,
  edgePredicateSchema,
  entityKindSchema,
  evidenceKindSchema,
  identifierStatusSchema,
  identifierTypeSchema,
  jobStatusSchema,
  jsonObjectSchema,
  nonEmptyTrimmed,
  optionalTrimmedSchema,
  patchOpSchema,
  playbookRunStatusSchema,
  proposalStatusSchema,
  questionStatusSchema,
  retractKindSchema,
  slugifyName,
  trimmedOrUndefined,
} from "@watchdog/schemas";

/** Agent ingress escape hatch — required for API-key child Graph writes. */
export const userOverrideSchema = z.literal(true).optional();

export {
  activityItemSchema,
  confidenceTierSchema,
  jsonObjectSchema,
  proposalStatusSchema,
  searchCaseResultSchema,
  taskSchema,
} from "@watchdog/schemas";

export const caseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  allowThirdPartyEgress: z.boolean(),
});

/** POST /cases — slug defaults from name when omitted. */
export const createCaseInputSchema = z
  .object({
    name: nonEmptyTrimmed,
    slug: z.string().optional(),
    description: optionalTrimmedSchema,
  })
  .transform((data) => {
    const slug = (
      trimmedOrUndefined(data.slug) ?? slugifyName(data.name)
    ).trim();
    return {
      name: data.name,
      slug,
      description: data.description,
    };
  })
  .refine((data) => data.slug.length > 0, {
    message: "Slug is required",
    path: ["slug"],
  });

/** PATCH /cases/{caseId} — partial update (name also regenerates slug, description, egress). */
export const updateCaseInputSchema = z.object({
  caseId: z.uuid(),
  name: optionalTrimmedSchema,
  description: optionalTrimmedSchema,
  allowThirdPartyEgress: z.boolean().optional(),
});

export const entitySchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  kind: entityKindSchema,
  name: z.string(),
  slug: z.string(),
  summary: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
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
});

/** Case-wide identifier list — includes owning entity labels. */
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
});

/** Case-wide edge list — absolute endpoints (no peer/direction). */
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
});

export const eventSchema = z.object({
  id: z.uuid(),
  entityId: z.uuid(),
  when: z.string(),
  what: z.string(),
  where: z.string().nullable(),
});

export const questionSchema = z.object({
  id: z.uuid(),
  entityId: z.uuid(),
  text: z.string(),
  status: questionStatusSchema,
  resolvedNote: z.string().nullable(),
});

export const presignedUploadSchema = z.object({
  url: z.string(),
  uri: z.string(),
  sha256: z.string(),
  mime: z.string(),
  byteLength: z.number().int(),
  expiresIn: z.number().int(),
  headers: z.record(z.string(), z.string()),
});

export const evidenceSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  entityId: z.uuid().nullable(),
  kind: evidenceKindSchema,
  label: z.string().nullable(),
  notes: z.string().nullable(),
  mime: z.string().nullable(),
  uri: z.string().nullable(),
  sha256: z.string().nullable(),
  text: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  actorId: z.string(),
  actorLabel: z.string(),
  capturedAt: z.string(),
  processedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
});

export const jobSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  capabilityId: z.string(),
  input: jsonObjectSchema,
  output: z
    .array(
      z.object({
        name: z.string(),
        mime: z.string(),
        uri: z.string(),
        sha256: z.string(),
      })
    )
    .nullable(),
  status: jobStatusSchema,
  error: z.string().nullable(),
  interpretError: z.string().nullable(),
  proposalId: z.uuid().nullable(),
  evidenceIds: z.array(z.uuid()).nullable(),
  resultSummary: z.string().nullable(),
  fromCache: z.boolean(),
  suppressedCount: z.number().int(),
  actorId: z.string(),
  actorLabel: z.string(),
  logs: z.array(z.string()),
  playbookRunId: z.uuid().nullable(),
  playbookStep: z.number().int().nullable(),
  playbookFanIndex: z.number().int(),
  playbookId: z.string().nullable(),
  playbookRunStatus: playbookRunStatusSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});

export const jobListSchema = jobSchema.omit({ logs: true });

const identifierCollisionSchema = z.object({
  opId: z.uuid(),
  type: identifierTypeSchema,
  value: z.string(),
  entityId: z.uuid(),
  entityName: z.string(),
  entitySlug: z.string(),
});

export const proposalSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  jobId: z.uuid().nullable(),
  capabilityId: z.string().nullable(),
  status: proposalStatusSchema,
  patch: z.array(patchOpSchema),
  summary: z.string().nullable(),
  suppressedCount: z.number().int(),
  evidenceIds: z.array(z.uuid()),
  rejectReason: z.string().nullable(),
  decidedBy: z.string().nullable(),
  decidedByLabel: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
  agentSourced: z.boolean(),
  userOverridden: z.boolean(),
  createdBy: z.string().nullable(),
  createdByLabel: z.string().nullable(),
  entityNames: z.record(z.string(), z.string()).optional(),
  entitySlugs: z.record(z.string(), z.string()).optional(),
  identifierCollisions: z.array(identifierCollisionSchema).optional(),
});

export const graphWriteResultSchema = z.object({
  writeId: z.uuid(),
  confidence: z.literal("unverified"),
  opCount: z.number().int(),
  replayed: z.boolean(),
  actorLabel: z.string(),
});

export const graphWriteRecordSchema = z.object({
  id: z.uuid(),
  caseId: z.uuid(),
  actorId: z.string(),
  actorLabel: z.string(),
  channel: z.string(),
  userOverridden: z.boolean(),
  confidence: z.string(),
  summary: z.string().nullable(),
  createdAt: z.string(),
});

export const credentialSlotSchema = z.object({
  name: z.string(),
  label: z.string(),
  description: z.string(),
  configured: z.boolean(),
  updatedAt: z.string().nullable(),
});
