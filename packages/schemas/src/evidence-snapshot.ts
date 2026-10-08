import { z } from "zod";

import { evidenceKindSchema } from "./enums";
import { caseIdSchema } from "./ids";
import { uuidSchema } from "./primitives";

/** What a Process Cap may read — packed once by core/worker. */
export const evidenceSnapshotSchema = z.object({
  evidenceId: uuidSchema,
  caseId: caseIdSchema,
  entityId: uuidSchema.optional(),
  kind: evidenceKindSchema,
  label: z.string().optional(),
  text: z.string(),
  mime: z.string().optional(),
  sha256: z.string().nullable().optional(),
  uri: z.string().nullable().optional(),
  packedAt: z.string().describe("ISO timestamp — snapshot isolation"),
  packerVersion: z.literal(1).default(1),
});

export type EvidenceSnapshot = z.infer<typeof evidenceSnapshotSchema>;
