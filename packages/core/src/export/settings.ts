import { fileURLToPath } from "node:url";

import { env } from "@watchdog/env/server";

const BYTES_PER_MB = 1024 * 1024;
const MS_PER_HOUR = 60 * 60 * 1000;

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
  return {
    inlineMaxBytes: env.WD_EXPORT_INLINE_MAX_MB * BYTES_PER_MB,
    linkTtlMs: env.WD_EXPORT_LINK_TTL_HOURS * MS_PER_HOUR,
    concurrency: env.WD_EXPORT_CONCURRENCY,
  };
}

/** The Case Export shadow's folder (`WD_EXPORT_DIR`); unset is the repository's `export/` folder. */
export function caseExportDir(): string {
  return (
    env.WD_EXPORT_DIR ??
    fileURLToPath(new URL("../../../../export", import.meta.url))
  );
}
