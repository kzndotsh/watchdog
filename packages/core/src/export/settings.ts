import { env } from "@watchdog/env/server";

const BYTES_PER_MB = 1024 * 1024;
const MS_PER_HOUR = 60 * 60 * 1000;

/** The defaults of `WD_EXPORT_*`, for a process where `env` is not validated (lint, unit tests). */
const DEFAULT_INLINE_MAX_MB = 100;
const DEFAULT_LINK_TTL_HOURS = 24;
const DEFAULT_CONCURRENCY = 4;

/** What the Case export reads from configuration (`WD_EXPORT_*`), in the units the code uses. */
export type CaseExportSettings = {
  /** Evidence bytes above which an export runs as a Job instead of streaming to the download. */
  readonly inlineMaxBytes: number;
  /** How long after the Job finishes the download link works. */
  readonly linkTtlMs: number;
  /** Evidence reads and entity renders in flight at once. */
  readonly concurrency: number;
};

/** Read at call time, so a request, the worker and the sweep always agree. */
export function caseExportSettings(): CaseExportSettings {
  const inlineMaxMb: number | undefined = env.WD_EXPORT_INLINE_MAX_MB;
  const linkTtlHours: number | undefined = env.WD_EXPORT_LINK_TTL_HOURS;
  const concurrency: number | undefined = env.WD_EXPORT_CONCURRENCY;
  return {
    inlineMaxBytes: (inlineMaxMb ?? DEFAULT_INLINE_MAX_MB) * BYTES_PER_MB,
    linkTtlMs: (linkTtlHours ?? DEFAULT_LINK_TTL_HOURS) * MS_PER_HOUR,
    concurrency: concurrency ?? DEFAULT_CONCURRENCY,
  };
}
