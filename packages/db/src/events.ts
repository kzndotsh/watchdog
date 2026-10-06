import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";

import { env } from "@watchdog/env/server";
import type { WatchdogEvent } from "@watchdog/schemas/feed";

import { client } from "./client";

export const WATCHDOG_CHANNEL = "watchdog_events";
/** The activity log's wake-up channel; only the `activity_notify` trigger sends on it. */
export const ACTIVITY_CHANNEL = "watchdog_activity";

const RECONNECT_DELAY_MS = 1000;
const INITIAL_CONNECT_MAX_ATTEMPTS = 30;

/**
 * Emit a NOTIFY on the watchdog_events channel via the shared pool.
 */
export async function notifyEvent(event: WatchdogEvent): Promise<void> {
  await client.notify(WATCHDOG_CHANNEL, JSON.stringify(event));
}

/** `listenForEvents` for any channel (the activity tailer listens on `ACTIVITY_CHANNEL`). */
export function listenOnChannel(
  channel: string,
  onNotification: (payload: string) => void,
  onReady?: () => void,
  onError?: (error: unknown) => void
): { end: () => Promise<void> } {
  let ended = false;
  let sql: ReturnType<typeof postgres> | undefined;
  let readyNotified = false;

  async function endConnection(): Promise<void> {
    const current = sql;
    sql = undefined;
    if (current) {
      await current.end({ timeout: 0 }).catch(() => {});
    }
  }

  async function loop(): Promise<void> {
    let failedAttempts = 0;
    // Initial-connection retries run sequentially.
    /* oxlint-disable eslint/no-await-in-loop, eslint/no-unmodified-loop-condition, eslint/no-loop-func */
    while (!ended) {
      sql = postgres(env.DATABASE_URL, {
        max: 1,
        idle_timeout: 0,
        connect_timeout: 10,
      });
      try {
        await sql.listen(channel, onNotification, () => {
          if (!readyNotified) {
            readyNotified = true;
            failedAttempts = 0;
            onReady?.();
          }
        });
        // Established: keep the connection open until `end()`. (Awaiting
        // `listen` only waits for LISTEN to start; ending the connection here
        // would drop every notification.) postgres.js re-LISTENs on its own
        // after a dropped connection; consumers keep a fallback poll for the gap.
        return;
      } catch (error) {
        await endConnection();
        if (ended) return;
        if (!readyNotified) {
          failedAttempts += 1;
          if (failedAttempts >= INITIAL_CONNECT_MAX_ATTEMPTS) {
            onError?.(error);
            return;
          }
        }
        await sleep(RECONNECT_DELAY_MS);
      }
    }
    /* oxlint-enable eslint/no-await-in-loop, eslint/no-unmodified-loop-condition, eslint/no-loop-func */
  }

  void loop();

  return {
    end: async () => {
      ended = true;
      await endConnection();
    },
  };
}

/**
 * Open a dedicated LISTEN connection and call onNotification for each
 * message on watchdog_events. Returns a cleanup function.
 *
 * Retries the initial connection; once LISTEN is established the connection
 * stays open until `end()` (postgres.js re-LISTENs after a drop). `onError`
 * is only called after repeated initial connection failures.
 *
 * Used by the SSE route in apps/web — keeps postgres out of web's deps.
 */
export function listenForEvents(
  onNotification: (payload: string) => void,
  onReady?: () => void,
  onError?: (error: unknown) => void
): { end: () => Promise<void> } {
  return listenOnChannel(WATCHDOG_CHANNEL, onNotification, onReady, onError);
}
