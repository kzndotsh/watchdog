import type { z } from "zod";

import type { ClaimRecord as CoreClaimRecord } from "@watchdog/core";
import {
  createClaimInputSchema,
  listClaimsInputSchema,
  retractClaimInputSchema,
  updateClaimInputSchema,
} from "@watchdog/schemas";

export type ClaimRecord = CoreClaimRecord;

export { listClaimsInputSchema };
export type ListClaimsInput = z.output<typeof listClaimsInputSchema>;

export { createClaimInputSchema };
export type CreateClaimInput = z.input<typeof createClaimInputSchema>;
export type CreateClaimParsed = z.output<typeof createClaimInputSchema>;

export { retractClaimInputSchema };
export type RetractClaimInput = z.output<typeof retractClaimInputSchema>;

export { updateClaimInputSchema };
export type UpdateClaimInput = z.output<typeof updateClaimInputSchema>;
