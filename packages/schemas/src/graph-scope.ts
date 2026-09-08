import { z } from "zod";

import { entitySlugSchema, trimmedUuidSchema } from "./primitives";

export const caseScopeInputSchema = z.object({
  caseId: trimmedUuidSchema,
});

export const entityScopeInputSchema = z.object({
  caseId: trimmedUuidSchema,
  entityId: trimmedUuidSchema,
});

export const entitySlugScopeInputSchema = z.object({
  caseId: trimmedUuidSchema,
  slug: entitySlugSchema,
});

export const listClaimsInputSchema = entityScopeInputSchema.extend({
  includeRetracted: z.boolean().optional().default(false),
});

export const claimScopeInputSchema = z.object({
  caseId: trimmedUuidSchema,
  claimId: trimmedUuidSchema,
});

export const questionScopeInputSchema = z.object({
  caseId: trimmedUuidSchema,
  questionId: trimmedUuidSchema,
});

export const eventScopeInputSchema = z.object({
  caseId: trimmedUuidSchema,
  eventId: trimmedUuidSchema,
});

export const edgeScopeInputSchema = z.object({
  caseId: trimmedUuidSchema,
  edgeId: trimmedUuidSchema,
});

export const evidenceScopeInputSchema = z.object({
  caseId: trimmedUuidSchema,
  evidenceId: trimmedUuidSchema,
});

export const identifierScopeInputSchema = z.object({
  caseId: trimmedUuidSchema,
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
