import { z } from "zod";

import type {
  CaseIdentifierRecord as CoreCaseIdentifierRecord,
  IdentifierRecord as CoreIdentifierRecord,
} from "@watchdog/core";
import {
  confidenceTierSchema,
  identifierStatusSchema,
  identifierTypeSchema,
  identifierUpdateFieldsSchema,
  nonEmptyTrimmed,
  optionalTrimmedSchema,
  uuidListSchema,
  uuidSchema,
} from "@watchdog/schemas";

export type IdentifierRecord = CoreIdentifierRecord;
export type CaseIdentifierRecord = CoreCaseIdentifierRecord;

export const entityScopeInputSchema = z.object({
  caseId: uuidSchema,
  entityId: uuidSchema,
});
export type EntityScopeInput = z.output<typeof entityScopeInputSchema>;

export const caseScopeInputSchema = z.object({
  caseId: uuidSchema,
});
export type CaseScopeInput = z.output<typeof caseScopeInputSchema>;

export const createIdentifierInputSchema = z.object({
  caseId: uuidSchema,
  entityId: uuidSchema,
  type: identifierTypeSchema,
  value: nonEmptyTrimmed,
  confidence: confidenceTierSchema,
  platform: optionalTrimmedSchema,
  status: identifierStatusSchema.default("unknown"),
  notes: optionalTrimmedSchema,
  evidenceIds: uuidListSchema.optional(),
});
/** Wire / form payload (status optional before default). */
export type CreateIdentifierInput = z.input<typeof createIdentifierInputSchema>;
/** After validator parse (status always present). */
export type CreateIdentifierParsed = z.output<
  typeof createIdentifierInputSchema
>;

export const updateIdentifierInputSchema = z
  .object({
    caseId: uuidSchema,
    identifierId: uuidSchema,
  })
  .extend(identifierUpdateFieldsSchema.shape);
export type UpdateIdentifierInput = z.output<
  typeof updateIdentifierInputSchema
>;
