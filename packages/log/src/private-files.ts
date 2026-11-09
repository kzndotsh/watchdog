import { mkdirSync, chmodSync } from "node:fs";
import { chmod, lstat, readdir } from "node:fs/promises";
import path from "node:path";

/** Owner-only: log events carry request and Job detail that other local users must not read. */
const LOG_DIR_MODE = 0o700;
const LOG_FILE_MODE = 0o600;

/** Between directory scans after the first write: bounds the readdir cost to one every few seconds. */
const RESCAN_MS = 5000;

/**
 * Makes the NDJSON drain directory 0700 (created, or tightened when it already exists) and returns
 * `restrictNewFiles`, which sets 0600 on the regular files the drain has made since the last call.
 * evlog creates its files with the process umask and has no mode option, so they are fixed after
 * the write; the 0700 directory keeps other users out meanwhile. Symlinks and subdirectories are
 * never touched (`lstat`, not `stat`: a link must not lead a chmod outside the directory).
 *
 * Never throws: a failed chmod must not stop logging. A failure is reported instead: `warning`
 * for the directory, and the first failed file from `restrictNewFiles` (once; later ones are quiet).
 */
export function createPrivateLogDir(
  dir: string,
  now: () => number = Date.now
): {
  warning: string | null;
  restrictNewFiles: () => Promise<string | null>;
} {
  let warning: string | null = null;
  try {
    mkdirSync(dir, { recursive: true, mode: LOG_DIR_MODE });
    chmodSync(dir, LOG_DIR_MODE);
  } catch {
    warning = `log directory ${dir} could not be made owner-only (0700): its logs may be readable by other users`;
  }
  let lastScan = Number.NEGATIVE_INFINITY;
  let fileWarned = false;
  return {
    warning,
    restrictNewFiles: async () => {
      const at = now();
      if (at - lastScan < RESCAN_MS) return null;
      let failed = false;
      try {
        const names = await readdir(dir);
        // Only a scan that ran starts the quiet period; a failed one is retried on the next write.
        lastScan = at;
        const results = await Promise.allSettled(
          names.map(async (name) => {
            const file = path.join(dir, name);
            const entry = await lstat(file);
            if (entry.isFile()) await chmod(file, LOG_FILE_MODE);
          })
        );
        failed = results.some((r) => r.status === "rejected");
      } catch {
        failed = true;
      }
      if (!failed || fileWarned) return null;
      fileWarned = true;
      return `log files in ${dir} could not be made owner-only (0600): they may be readable by other users`;
    },
  };
}
