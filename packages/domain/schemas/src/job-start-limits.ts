import { z } from "zod";

import { NAME_MAX } from "./limits";

/** What a Job start limit is counted for: a whole organization, or one API key. */
export const JOB_START_LIMIT_SCOPES = ["organization", "key"] as const;
export type JobStartLimitScope = (typeof JOB_START_LIMIT_SCOPES)[number];
export const jobStartLimitScopeSchema = z.enum(JOB_START_LIMIT_SCOPES);

/** Largest limit that can be stored or configured: a typo guard, not a policy. */
export const JOB_START_LIMIT_MAX = 1_000_000;

/** One limit as a caller sees it: what applies now, where it came from, and the window's use. */
export const jobStartLimitStateSchema = z.object({
  /** Starts allowed per window. */
  limit: z.number().int().min(0),
  /** Starts taken in the current window. */
  used: z.number().int().min(0),
  /** `default` is the instance setting; `override` was set for this organization or key. */
  source: z.enum(["default", "override"]),
  /** The instance default this one replaces (the same number when `source` is `default`). */
  defaultLimit: z.number().int().min(0),
});
export type JobStartLimitState = z.output<typeof jobStartLimitStateSchema>;

export const jobStartLimitsSchema = z.object({
  /** Length of the counting window, in seconds. */
  windowSeconds: z.number().int().positive(),
  organization: jobStartLimitStateSchema,
  /** The calling API key's limit; null for a signed-in session. */
  key: jobStartLimitStateSchema.nullable(),
  /** Keys of this organization that have their own limit. */
  keyOverrides: z.array(
    z.object({ keyId: z.string(), limit: z.number().int().min(0) })
  ),
});
export type JobStartLimits = z.output<typeof jobStartLimitsSchema>;

/**
 * Set (or, with `maxStarts` null, clear) a Job start limit: the organization's when `keyId` is left
 * out, else that API key's.
 */
export const setJobStartLimitInputSchema = z.object({
  keyId: z.string().trim().min(1).max(NAME_MAX).optional(),
  maxStarts: z.number().int().min(0).max(JOB_START_LIMIT_MAX).nullable(),
});
export type SetJobStartLimitInput = z.output<
  typeof setJobStartLimitInputSchema
>;
