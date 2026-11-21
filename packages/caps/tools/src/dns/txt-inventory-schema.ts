import { z } from "zod";

export const txtTokenSchema = z.object({
  record: z.string(),
  /** Parsed posture class. */
  kind: z.enum(["verification", "spf", "dmarc", "dkim", "other"]),
  /** Matched SaaS / product slug when known. */
  service: z.string().nullable(),
  /** Human label for Jobs / Claim text. */
  product: z.string().nullable(),
});

export const txtInventorySnapshotSchema = z.object({
  host: z.string().min(1),
  queriedAt: z.string().min(1),
  records: z.array(z.string()),
  tokens: z.array(txtTokenSchema),
});

export type TxtToken = z.infer<typeof txtTokenSchema>;
export type TxtInventorySnapshot = z.infer<typeof txtInventorySnapshotSchema>;
