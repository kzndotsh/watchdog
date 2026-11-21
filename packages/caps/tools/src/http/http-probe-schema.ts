import { z } from "zod";

export const httpProbeSnapshotSchema = z.object({
  host: z.string().min(1),
  queriedAt: z.string().min(1),
  finalUrl: z.string(),
  status: z.number(),
  ok: z.boolean(),
  securityHeaders: z.record(z.string(), z.string()),
  server: z.string().nullable(),
  via: z.string().nullable(),
  cdnHints: z.array(z.string()),
  securityTxt: z.object({
    url: z.string(),
    status: z.number(),
    present: z.boolean(),
    bodyPreview: z.string().nullable(),
  }),
  favicon: z.object({
    url: z.string(),
    status: z.number(),
    sha256: z.string().nullable(),
    contentType: z.string().nullable(),
  }),
  error: z.string().optional(),
});

export type HttpProbeSnapshot = z.infer<typeof httpProbeSnapshotSchema>;
