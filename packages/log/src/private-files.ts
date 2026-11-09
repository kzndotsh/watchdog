import { mkdirSync, chmodSync } from "node:fs";
import { chmod, readdir } from "node:fs/promises";
import path from "node:path";

/** Owner-only: log events carry request and Job detail that other local users must not read. */
export const LOG_DIR_MODE = 0o700;
export const LOG_FILE_MODE = 0o600;

/** Between directory scans after the first write: bounds the readdir cost to one every few seconds. */
const RESCAN_MS = 5000;

/**
 * Makes the NDJSON drain directory 0700 (created, or tightened when it already exists) and returns
 * `restrictNewFiles`, which sets 0600 on files the drain has made since the last call. evlog creates
 * its files with the process umask and has no mode option, so they are fixed after the write;
 * the 0700 directory keeps other users out meanwhile. Never throws: a failed chmod must not stop logging.
 */
export function createPrivateLogDir(
  dir: string,
  now: () => number = Date.now
): { restrictNewFiles: () => Promise<void> } {
  try {
    mkdirSync(dir, { recursive: true, mode: LOG_DIR_MODE });
    chmodSync(dir, LOG_DIR_MODE);
  } catch {
    // Unwritable directory: evlog's own drain reports it once and disables itself.
  }
  let lastScan = Number.NEGATIVE_INFINITY;
  return {
    restrictNewFiles: async () => {
      const at = now();
      if (at - lastScan < RESCAN_MS) return;
      try {
        const names = await readdir(dir);
        // Only a scan that ran starts the quiet period; a failed one is retried on the next write.
        lastScan = at;
        await Promise.allSettled(
          names.map(async (name) => {
            await chmod(path.join(dir, name), LOG_FILE_MODE);
          })
        );
      } catch {
        // Same as above.
      }
    },
  };
}
