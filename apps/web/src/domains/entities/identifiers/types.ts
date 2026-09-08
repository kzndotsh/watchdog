import type { z } from "zod";

import type {
  CaseIdentifierRecord as CoreCaseIdentifierRecord,
  IdentifierRecord as CoreIdentifierRecord,
} from "@watchdog/core";
import {
  createIdentifierInputSchema,
  deleteIdentifierInputSchema,
  updateIdentifierInputSchema,
} from "@watchdog/schemas";

export type IdentifierRecord = CoreIdentifierRecord;
export type CaseIdentifierRecord = CoreCaseIdentifierRecord;

export {
  caseScopeInputSchema,
  entityScopeInputSchema,
  type CaseScopeInput,
  type EntityScopeInput,
} from "@watchdog/schemas";

export { createIdentifierInputSchema };
export type CreateIdentifierInput = z.input<typeof createIdentifierInputSchema>;
export type CreateIdentifierParsed = z.output<
  typeof createIdentifierInputSchema
>;

export { updateIdentifierInputSchema };
export type UpdateIdentifierInput = z.output<
  typeof updateIdentifierInputSchema
>;

export { deleteIdentifierInputSchema };
export type DeleteIdentifierInput = z.output<
  typeof deleteIdentifierInputSchema
>;
