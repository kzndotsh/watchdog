import { z } from "zod";

import { identifierTypeSchema, proposalStatusSchema } from "./enums";
import { caseIdSchema } from "./ids";
import { listPageSchema } from "./lists/list-page";
import { patchOpSchema } from "./patch";

/** A Proposal queue row (#580): what it shows, never the patch. */
export const proposalQueueItemSchema = z.object({
  id: z.uuid(),
  status: proposalStatusSchema,
  summary: z.string().nullable(),
  capabilityId: z.string().nullable(),
  playbookId: z.string().nullable(),
  createdAt: z.string(),
  opCounts: z.record(z.string(), z.number().int()),
  evidenceCount: z.number().int(),
});

export const identifierCollisionSchema = z.object({
  opId: z.uuid(),
  type: identifierTypeSchema,
  value: z.string(),
  entityId: z.uuid(),
  entityName: z.string(),
  entitySlug: z.string(),
});

export const proposalSchema = z.object({
  id: z.uuid(),
  caseId: caseIdSchema,
  jobId: z.uuid().nullable(),
  capabilityId: z.string().nullable(),
  playbookId: z.string().nullable(),
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
  createdBy: z.string().nullable(),
  createdByLabel: z.string().nullable(),
  entityNames: z.record(z.string(), z.string()).optional(),
  entitySlugs: z.record(z.string(), z.string()).optional(),
  identifierCollisions: z.array(identifierCollisionSchema).optional(),
});

export const proposalListPageSchema = listPageSchema(proposalSchema);
export const proposalQueuePageSchema = listPageSchema(proposalQueueItemSchema);
