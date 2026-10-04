import type { z } from "zod";

import type { ClaimRecord as CoreClaimRecord } from "@watchdog/core/graph";
import type {
  createClaimInputSchema,
  listClaimsInputSchema,
  retractClaimInputSchema,
  updateClaimInputSchema,
} from "@watchdog/schemas/graph";

export type ClaimRecord = CoreClaimRecord;

export type ListClaimsInput = z.output<typeof listClaimsInputSchema>;

export type CreateClaimInput = z.input<typeof createClaimInputSchema>;
export type CreateClaimParsed = z.output<typeof createClaimInputSchema>;

export type RetractClaimInput = z.output<typeof retractClaimInputSchema>;

export type UpdateClaimInput = z.output<typeof updateClaimInputSchema>;
