import { z } from "zod";

import { trimmedRetractKindSchema } from "./enums";
import { claimScopeInputSchema } from "./graph-scope";
import { NOTES_MAX } from "./limits";
import { requiredText } from "./primitives";

/** Shared fields for claim retract POST (web forms + API + CLI). */
export const retractClaimFieldsSchema = z.object({
  kind: trimmedRetractKindSchema,
  reason: requiredText(NOTES_MAX),
});

/** Claim retract POST body including scope. */
export const retractClaimInputSchema = claimScopeInputSchema.extend(
  retractClaimFieldsSchema.shape
);

export type RetractClaimFields = z.output<typeof retractClaimFieldsSchema>;
export type RetractClaimInput = z.output<typeof retractClaimInputSchema>;
