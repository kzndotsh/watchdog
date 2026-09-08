import { z } from "zod";

import {
  entityKindSchema,
  evidenceKindSchema,
  identifierTypeSchema,
  jobStatusSchema,
  taskPrioritySchema,
  taskStatusSchema,
} from "./enums";
import { jsonObjectSchema, trimmedUuidSchema, uuidSchema } from "./primitives";

export const SEARCH_MIN_QUERY_LENGTH = 2;

export const searchCaseInputSchema = z.object({
  caseId: trimmedUuidSchema,
  q: z.string().trim().min(SEARCH_MIN_QUERY_LENGTH),
  limit: z.number().int().min(1).max(50).optional(),
});
export type SearchCaseInput = z.output<typeof searchCaseInputSchema>;

export const searchCaseEntityHitSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
  kind: entityKindSchema,
});

export const searchCaseIdentifierHitSchema = z.object({
  id: uuidSchema,
  type: identifierTypeSchema,
  platform: z.string(),
  value: z.string(),
  entityId: uuidSchema,
  entityName: z.string(),
  entitySlug: z.string(),
});

export const searchCaseEvidenceHitSchema = z.object({
  id: uuidSchema,
  label: z.string().nullable(),
  kind: evidenceKindSchema,
  sourceUrl: z.string().nullable(),
  entityName: z.string().nullable(),
});

export const searchCaseTaskHitSchema = z.object({
  id: uuidSchema,
  title: z.string(),
  status: taskStatusSchema,
  priority: taskPrioritySchema.nullable(),
  entityId: uuidSchema.nullable(),
  entityName: z.string().nullable(),
});

export const searchCaseProposalHitSchema = z.object({
  id: uuidSchema,
  summary: z.string().nullable(),
  capabilityId: z.string().nullable(),
  playbookId: z.string().nullable(),
  entityName: z.string().nullable(),
});

export const searchCaseJobHitSchema = z.object({
  id: uuidSchema,
  capabilityId: z.string(),
  status: jobStatusSchema,
  resultSummary: z.string().nullable(),
  input: jsonObjectSchema,
  playbookId: z.string().nullable(),
});

export const searchCaseCaseHitSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: z.string(),
});

export const searchCaseResultSchema = z.object({
  q: z.string(),
  entities: z.array(searchCaseEntityHitSchema),
  identifiers: z.array(searchCaseIdentifierHitSchema),
  evidence: z.array(searchCaseEvidenceHitSchema),
  tasks: z.array(searchCaseTaskHitSchema),
  jobs: z.array(searchCaseJobHitSchema),
  proposals: z.array(searchCaseProposalHitSchema),
  cases: z.array(searchCaseCaseHitSchema),
  /** evidenceId → display label for job input resolution in search chrome. */
  evidenceLabels: z.record(z.string(), z.string()),
  /** entityId → display label for job input resolution in search chrome. */
  entityLabels: z.record(z.string(), z.string()),
});
export type SearchCaseResult = z.output<typeof searchCaseResultSchema>;
