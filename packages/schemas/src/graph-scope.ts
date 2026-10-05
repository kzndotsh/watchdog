import { z } from "zod";

import { trimmedCaseIdSchema } from "./ids";
import { entitySlugSchema, trimmedUuidSchema } from "./primitives";

export const caseScopeInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
});

export const entityScopeInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  entityId: trimmedUuidSchema,
});

export const entitySlugScopeInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  slug: entitySlugSchema,
});

export const listClaimsInputSchema = entityScopeInputSchema.extend({
  includeRetracted: z.boolean().optional().default(false),
});

export const claimScopeInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  claimId: trimmedUuidSchema,
});

export const questionScopeInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  questionId: trimmedUuidSchema,
});

export const eventScopeInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  eventId: trimmedUuidSchema,
});

export const edgeScopeInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  edgeId: trimmedUuidSchema,
});

export const evidenceScopeInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  evidenceId: trimmedUuidSchema,
});

export const identifierScopeInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  identifierId: trimmedUuidSchema,
});

export type CaseScopeInput = z.output<typeof caseScopeInputSchema>;
export type EntityScopeInput = z.output<typeof entityScopeInputSchema>;
export type EntitySlugScopeInput = z.output<typeof entitySlugScopeInputSchema>;
export type ListClaimsInput = z.output<typeof listClaimsInputSchema>;
export type ClaimScopeInput = z.output<typeof claimScopeInputSchema>;
export type QuestionScopeInput = z.output<typeof questionScopeInputSchema>;
export type EventScopeInput = z.output<typeof eventScopeInputSchema>;
export type EdgeScopeInput = z.output<typeof edgeScopeInputSchema>;
export type EvidenceScopeInput = z.output<typeof evidenceScopeInputSchema>;
export type IdentifierScopeInput = z.output<typeof identifierScopeInputSchema>;
