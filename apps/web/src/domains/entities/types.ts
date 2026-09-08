import type { z } from "zod";

import type { EntityRecord as CoreEntityRecord } from "@watchdog/core";
import {
  caseScopeInputSchema,
  createEntityInputSchema,
  deleteEntityInputSchema,
  entitySlugScopeInputSchema,
  updateEntityInputSchema,
  type CaseScopeInput,
  type DeleteEntityInput,
  type EntitySlugScopeInput,
  type UpdateEntityInput,
} from "@watchdog/schemas";

export type EntityRecord = CoreEntityRecord;

export const caseIdInputSchema = caseScopeInputSchema;
export type CaseIdInput = CaseScopeInput;

export const caseSlugInputSchema = entitySlugScopeInputSchema;
export type CaseSlugInput = EntitySlugScopeInput;

export { createEntityInputSchema };
export type CreateEntityInput = z.output<typeof createEntityInputSchema>;

export { updateEntityInputSchema as updateEntityFieldsInputSchema };
export type UpdateEntityFieldsInput = UpdateEntityInput;

export { deleteEntityInputSchema };
export type { DeleteEntityInput };
