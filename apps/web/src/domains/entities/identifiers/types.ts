import type { z } from "zod";

import type {
  CaseIdentifierRecord as CoreCaseIdentifierRecord,
  IdentifierRecord as CoreIdentifierRecord,
} from "@watchdog/core";
import type {
  createIdentifierInputSchema,
  deleteIdentifierInputSchema,
  updateIdentifierInputSchema,
} from "@watchdog/schemas";

export type IdentifierRecord = CoreIdentifierRecord;
export type CaseIdentifierRecord = CoreCaseIdentifierRecord;

export type CreateIdentifierInput = z.input<typeof createIdentifierInputSchema>;
export type CreateIdentifierParsed = z.output<
  typeof createIdentifierInputSchema
>;

export type UpdateIdentifierInput = z.output<
  typeof updateIdentifierInputSchema
>;

export type DeleteIdentifierInput = z.output<
  typeof deleteIdentifierInputSchema
>;
