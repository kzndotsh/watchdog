import { z } from "zod";

export const archiveSubmitResultSchema = z.object({
  service: z.literal("wayback"),
  accepted: z.boolean(),
  archiveUrl: z.string().nullable(),
  detail: z.string().nullable(),
  status: z.number().int().nullable(),
});

export const archiveSubmitSnapshotSchema = z.object({
  url: z.string().min(1),
  queriedAt: z.string().min(1),
  results: z.array(archiveSubmitResultSchema),
});

export type ArchiveSubmitResult = z.infer<typeof archiveSubmitResultSchema>;
export type ArchiveSubmitSnapshot = z.infer<typeof archiveSubmitSnapshotSchema>;
