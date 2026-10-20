import { z } from "zod";

import { trimmedCaseIdSchema } from "./ids";
import { NAME_MAX } from "./limits";
import { requiredText } from "./primitives";
import { proposalPatchFieldsSchema } from "./proposal-ingress";

/** Agent graph write POST body (userOverride escape hatch). */
export const graphWriteInputSchema = proposalPatchFieldsSchema.extend({
  caseId: trimmedCaseIdSchema,
  userOverride: z.literal(true),
  idempotencyKey: requiredText(NAME_MAX).optional(),
});

export type GraphWriteInput = z.output<typeof graphWriteInputSchema>;
