import { z } from "zod";

import { nonEmptyTrimmed, trimmedUuidSchema } from "./primitives";
import { proposalPatchFieldsSchema } from "./proposal-ingress";

/** Agent graph write POST body (userOverride escape hatch). */
export const graphWriteInputSchema = proposalPatchFieldsSchema.extend({
  caseId: trimmedUuidSchema,
  userOverride: z.literal(true),
  idempotencyKey: nonEmptyTrimmed.optional(),
});

export type GraphWriteInput = z.output<typeof graphWriteInputSchema>;
