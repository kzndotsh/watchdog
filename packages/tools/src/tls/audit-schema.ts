import { z } from "zod";

export const tlsAuditSnapshotSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  queriedAt: z.string().min(1),
  protocol: z.string().nullable(),
  authorized: z.boolean(),
  authorizationError: z.string().nullable(),
  cipher: z
    .object({
      name: z.string(),
      standardName: z.string().optional(),
      version: z.string().optional(),
    })
    .nullable(),
  certificate: z
    .object({
      subject: z.string().nullable(),
      issuer: z.string().nullable(),
      validFrom: z.string().nullable(),
      validTo: z.string().nullable(),
      fingerprint256: z.string().nullable(),
      subjectAltNames: z.array(z.string()),
      serialNumber: z.string().nullable(),
    })
    .nullable(),
});

export type TlsAuditSnapshot = z.infer<typeof tlsAuditSnapshotSchema>;
