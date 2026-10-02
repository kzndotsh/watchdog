import { capTimeoutCeilingMs, requireCapability } from "@watchdog/caps";
import { capTimeoutMs } from "@watchdog/caps/sdk";

/**
 * Headroom after a Cap's abort timer for post-run work (upload, landEvidence,
 * interpret) before pg-boss may reclaim the attempt. Must keep expire above the
 * abort window so a redelivery cannot collide on the cancel registry by jobId.
 */
export const POST_RUN_SLACK_MS = 60_000;

/** Per-job pg-boss `expireInSeconds` derived from that Cap's timeoutMs. */
export function capExpireSeconds(capabilityId: string): number {
  const cap = requireCapability(capabilityId);
  return Math.ceil((capTimeoutMs(cap) + POST_RUN_SLACK_MS) / 1000);
}

/** Queue-default expire — ceiling across the Cap registry. */
export function queueExpireSeconds(): number {
  return Math.ceil((capTimeoutCeilingMs() + POST_RUN_SLACK_MS) / 1000);
}

/** Graceful `boss.stop` timeout — outlasts the slowest registered Cap. */
export function gracefulStopTimeoutMs(): number {
  return capTimeoutCeilingMs() + POST_RUN_SLACK_MS;
}
