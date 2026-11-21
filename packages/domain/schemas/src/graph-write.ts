import { z } from "zod";

import { confidenceTierSchema } from "./enums";
import { caseIdSchema, trimmedCaseIdSchema } from "./ids";
import { NAME_MAX } from "./limits";
import { listPageSchema } from "./lists/list-page";
import { requiredText } from "./primitives";
import { proposalPatchFieldsSchema } from "./proposal-ingress";

/** Agent graph write POST body (userOverride escape hatch). */
export const graphWriteInputSchema = proposalPatchFieldsSchema.extend({
  caseId: trimmedCaseIdSchema,
  userOverride: z.literal(true),
  idempotencyKey: requiredText(NAME_MAX).optional(),
});

export type GraphWriteInput = z.output<typeof graphWriteInputSchema>;

export const graphWriteResultSchema = z.object({
  writeId: z.uuid(),
  confidence: z.literal("unverified"),
  opCount: z.number().int(),
  replayed: z.boolean(),
  actorLabel: z.string(),
});

const graphWriteRecordSchema = z.object({
  id: z.uuid(),
  caseId: caseIdSchema,
  actorId: z.string(),
  actorLabel: z.string(),
  channel: z.string(),
  userOverridden: z.boolean(),
  confidence: confidenceTierSchema,
  summary: z.string().nullable(),
  createdAt: z.string(),
});

export const graphWritePageSchema = listPageSchema(graphWriteRecordSchema);
