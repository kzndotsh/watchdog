import { z } from "zod";

const dkimSelectorSchema = z.object({
  selector: z.string(),
  present: z.boolean(),
  records: z.array(z.string()),
});

/** Mail posture snapshot — MX + SPF/DMARC/DKIM from DNS TXT. */
export const mailConfigSnapshotSchema = z.object({
  host: z.string().min(1),
  queriedAt: z.string().min(1),
  mx: z.array(
    z.object({
      exchange: z.string(),
      priority: z.number(),
    })
  ),
  spf: z.object({
    present: z.boolean(),
    records: z.array(z.string()),
  }),
  dmarc: z.object({
    present: z.boolean(),
    records: z.array(z.string()),
  }),
  dkim: z.object({
    selectorsTried: z.array(z.string()),
    found: z.array(dkimSelectorSchema),
  }),
  txt: z.array(z.string()),
});

export type MailConfigSnapshot = z.infer<typeof mailConfigSnapshotSchema>;
