import { z } from "zod";

export const ctCertEntrySchema = z.object({
  commonName: z.string(),
  nameValue: z.string(),
  issuer: z.string(),
  notBefore: z.string(),
  notAfter: z.string(),
  serial: z.string(),
});

export const ctLookupSnapshotSchema = z.object({
  host: z.string().min(1),
  source: z.literal("crt.sh"),
  queriedAt: z.string().min(1),
  entries: z.array(ctCertEntrySchema),
  /** Deduped hostnames extracted from CN / SAN name_value. */
  domains: z.array(z.string().min(1)),
});

export type CtCertEntry = z.infer<typeof ctCertEntrySchema>;
export type CtLookupSnapshot = z.infer<typeof ctLookupSnapshotSchema>;
