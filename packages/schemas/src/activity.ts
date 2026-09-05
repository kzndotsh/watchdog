import { z } from "zod";

import { uuidSchema } from "./primitives";

export const ACTIVITY_KINDS = ["evidence", "job", "proposal", "task"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const activityKindSchema = z.enum(ACTIVITY_KINDS);

export const activityItemSchema = z.object({
  id: uuidSchema,
  kind: activityKindSchema,
  action: z.string(),
  caseId: uuidSchema,
  caseName: z.string(),
  label: z.string(),
  status: z.string().optional(),
  fromStatus: z.string().optional(),
  toStatus: z.string().optional(),
  at: z.string(),
  actor: z.string().optional(),
});
export type ActivityItem = z.output<typeof activityItemSchema>;

export const listRecentActivityInputSchema = z.object({
  caseId: uuidSchema.optional(),
  limit: z.number().int().min(1).max(50).optional(),
});
export type ListRecentActivityInput = z.output<
  typeof listRecentActivityInputSchema
>;
