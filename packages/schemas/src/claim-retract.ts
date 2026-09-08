import { z } from "zod";

import { trimmedRetractKindSchema } from "./enums";
import { claimScopeInputSchema } from "./graph-scope";
import { nonEmptyTrimmed } from "./primitives";

/** Shared fields for claim retract POST (web forms + API + CLI). */
export const retractClaimFieldsSchema = z.object({
  kind: trimmedRetractKindSchema,
  reason: nonEmptyTrimmed,
});

/** Claim retract POST body including scope. */
export const retractClaimInputSchema = claimScopeInputSchema.extend(
  retractClaimFieldsSchema.shape
);

export type RetractClaimFields = z.output<typeof retractClaimFieldsSchema>;
export type RetractClaimInput = z.output<typeof retractClaimInputSchema>;
