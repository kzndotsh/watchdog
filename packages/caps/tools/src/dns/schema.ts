import { z } from "zod";

const dnsMxRecordSchema = z.object({
  exchange: z.string(),
  priority: z.number(),
});

/** DNS resolve output — single SoT for tools producer + Cap report validation. */
export const dnsRecordsSchema = z.object({
  host: z.string(),
  a: z.array(z.string()),
  aaaa: z.array(z.string()),
  mx: z.array(dnsMxRecordSchema),
  txt: z.array(z.array(z.string())),
  ns: z.array(z.string()),
});

export type DnsRecords = z.infer<typeof dnsRecordsSchema>;
