import type { z } from "zod";

import type { EntityRecord as CoreEntityRecord } from "@watchdog/core/graph";
import {
  type createEntityInputSchema,
  caseScopeInputSchema,
  entitySlugScopeInputSchema,
  type CaseScopeInput,
  type EntitySlugScopeInput,
  type UpdateEntityInput,
} from "@watchdog/schemas";

export type EntityRecord = CoreEntityRecord;

export const caseIdInputSchema = caseScopeInputSchema;
export type CaseIdInput = CaseScopeInput;

export const caseSlugInputSchema = entitySlugScopeInputSchema;
export type CaseSlugInput = EntitySlugScopeInput;

export type CreateEntityInput = z.output<typeof createEntityInputSchema>;

export type UpdateEntityFieldsInput = UpdateEntityInput;
