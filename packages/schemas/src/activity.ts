import { z } from "zod";

import {
  optionalUuidSchema,
  parseTrimmedCaseId,
  uuidSchema,
} from "./primitives";

export const ACTIVITY_KINDS = ["evidence", "job", "proposal", "task"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export const activityKindSchema = z.enum(ACTIVITY_KINDS);

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  evidence: "Evidence",
  job: "Job",
  proposal: "Proposal",
  task: "Task",
};

/** Human label for recent-activity feed rows. */
export function activityKindLabel(kind: ActivityKind): string {
  return ACTIVITY_KIND_LABELS[kind];
}

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
  caseId: optionalUuidSchema,
  limit: z.number().int().min(1).max(50).optional(),
});
export type ListRecentActivityInput = z.output<
  typeof listRecentActivityInputSchema
>;

export interface SseCaseIdFilter {
  caseId: string | null;
}

export type ParseSseCaseIdParamResult =
  | { ok: true; value: SseCaseIdFilter }
  | { ok: false };

/** Trim + validate case id for SSE clients (`useLiveEvents`, etc.). */
export function normalizeSseCaseId(raw: string): string | undefined {
  return parseTrimmedCaseId(raw) ?? undefined;
}

/** Parse optional `caseId` query param for SSE `/api/events`. */
export function parseSseCaseIdParam(
  raw: string | null
): ParseSseCaseIdParamResult {
  if (raw === null) {
    return { ok: true, value: { caseId: null } };
  }
  if (raw.trim() === "") {
    return { ok: false };
  }
  const caseId = normalizeSseCaseId(raw);
  if (caseId === undefined) {
    return { ok: false };
  }
  return { ok: true, value: { caseId } };
}
