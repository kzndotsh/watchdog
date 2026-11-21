import { z } from "zod";

/** WHOIS snapshot — single SoT for tools producer + Cap report validation. */
export const whoisSnapshotSchema = z.object({
  host: z.string(),
  source: z.enum(["rdap", "whoisxml", "whoxy"]),
  registrar: z.string().nullable(),
  registrantOrg: z.string().nullable(),
  nameservers: z.array(z.string()),
  status: z.array(z.string()),
  registeredAt: z.string().nullish(),
  expiresAt: z.string().nullish(),
  raw: z.unknown(),
});

export type WhoisSnapshot = z.infer<typeof whoisSnapshotSchema>;
