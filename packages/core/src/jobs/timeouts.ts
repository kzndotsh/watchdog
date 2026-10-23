import { capTimeoutCeilingMs, requireCapability } from "@watchdog/caps";
import { capTimeoutMs } from "@watchdog/caps/sdk";

import {
  isSystemJobId,
  systemJobTimeoutCeilingMs,
  systemJobTimeoutMs,
} from "./system-jobs";

/**
 * Headroom after a Cap's abort timer for post-run work (upload, landEvidence,
 * interpret) before pg-boss may reclaim the attempt. Must keep expire above the
 * abort window so a redelivery cannot collide on the cancel registry by jobId.
 */
export const POST_RUN_SLACK_MS = 60_000;

/** Per-job pg-boss `expireInSeconds` derived from that Cap's (or system Job's) timeout. */
export function capExpireSeconds(capabilityId: string): number {
  const timeoutMs = isSystemJobId(capabilityId)
    ? systemJobTimeoutMs(capabilityId)
    : capTimeoutMs(requireCapability(capabilityId));
  return Math.ceil((timeoutMs + POST_RUN_SLACK_MS) / 1000);
}

function timeoutCeilingMs(): number {
  return Math.max(capTimeoutCeilingMs(), systemJobTimeoutCeilingMs());
}

/** Queue-default expire — ceiling across the Cap registry and the system Jobs. */
export function queueExpireSeconds(): number {
  return Math.ceil((timeoutCeilingMs() + POST_RUN_SLACK_MS) / 1000);
}

/** Graceful `boss.stop` timeout — outlasts the slowest registered Cap or system Job. */
export function gracefulStopTimeoutMs(): number {
  return timeoutCeilingMs() + POST_RUN_SLACK_MS;
}
