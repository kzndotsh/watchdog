import { env } from "@watchdog/env/server";

const DAY_MS = 86_400_000;

/** The restore window when `WD_CASE_RETENTION_DAYS` is unset: how long a deleted Case stays restorable. */
export const DEFAULT_CASE_RETENTION_DAYS = 30;

/**
 * Days a deleted Case stays restorable (`WD_CASE_RETENTION_DAYS`, default 30). Read at call
 * time, so the delete dialog, the Deleted Cases list and the purge job always agree.
 */
export function caseRetentionDays(): number {
  // `env` is not validated under SKIP_ENV_VALIDATION (lint, unit tests): fall back to the default.
  const configured: number | undefined = env.WD_CASE_RETENTION_DAYS;
  return configured ?? DEFAULT_CASE_RETENTION_DAYS;
}

/** The instant a tombstone stops being restorable (the scheduled purge takes it from then on). */
export function purgeDueAt(deletedAt: Date, retentionDays: number): Date {
  return new Date(deletedAt.getTime() + retentionDays * DAY_MS);
}

/** Whole days left before the purge, rounded up (a Case with 3 hours left has 1 day), never below 0. */
export function daysLeftBeforePurge(
  deletedAt: Date,
  retentionDays: number,
  now: Date
): number {
  const remainingMs =
    purgeDueAt(deletedAt, retentionDays).getTime() - now.getTime();
  return Math.max(0, Math.ceil(remainingMs / DAY_MS));
}

/** The newest `deleted_at` the scheduled purge takes: everything deleted at or before it is past the window. */
export function purgeCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * DAY_MS);
}
