/**
 * System Jobs: work the platform runs for a person that is not a Cap. A Cap collects from a
 * provider and proposes Graph changes; a system Job reads the Case and produces a file. It is
 * still a Job: the same row, queue, claim, cancel, reclaim, activity entries and status writer
 * (`lifecycle/settle`). What it skips is everything that belongs to a Cap: the catalog entry,
 * input schema, egress and credential checks, artifacts, Proposal and cache.
 */

import { CASE_EXPORT_JOB_ID } from "@watchdog/schemas/caps";

/** Large Case export: the archive is built on the worker and kept in object storage. */
export const CASE_EXPORT_JOB = CASE_EXPORT_JOB_ID;

const SYSTEM_JOB_TIMEOUT_MS = {
  [CASE_EXPORT_JOB]: 60 * 60 * 1000,
} as const;

export type SystemJobId = keyof typeof SYSTEM_JOB_TIMEOUT_MS;

export function isSystemJobId(
  capabilityId: string
): capabilityId is SystemJobId {
  return Object.hasOwn(SYSTEM_JOB_TIMEOUT_MS, capabilityId);
}

/** The abort window of a system Job, the counterpart of a Cap's `timeoutMs`. */
export function systemJobTimeoutMs(id: SystemJobId): number {
  return SYSTEM_JOB_TIMEOUT_MS[id];
}

/** The longest abort window of any system Job: the queue defaults must outlast it. */
export function systemJobTimeoutCeilingMs(): number {
  return Math.max(...Object.values(SYSTEM_JOB_TIMEOUT_MS));
}
