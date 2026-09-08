import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";

import { env } from "@watchdog/env/server";
import { isWatchdogEvent, type WatchdogEvent } from "@watchdog/schemas";

import { client } from "./client";

export { isWatchdogEvent, type WatchdogEvent };

export const WATCHDOG_CHANNEL = "watchdog_events";

const RECONNECT_DELAY_MS = 1000;
const INITIAL_CONNECT_MAX_ATTEMPTS = 30;

/**
 * Emit a NOTIFY on the watchdog_events channel via the shared pool.
 */
export async function notifyEvent(event: WatchdogEvent): Promise<void> {
  await client.notify(WATCHDOG_CHANNEL, JSON.stringify(event));
}

/**
 * Open a dedicated LISTEN connection and call onNotification for each
 * message on watchdog_events. Returns a cleanup function.
 *
 * Reconnects after mid-run disconnects. `onError` is only called after
 * repeated initial connection failures.
 *
 * Used by the SSE route in apps/web — keeps postgres out of web's deps.
 */
export function listenForEvents(
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
    // LISTEN reconnect must run sequentially after each disconnect.
    /* oxlint-disable eslint/no-await-in-loop, eslint/no-unmodified-loop-condition, eslint/no-loop-func */
    while (!ended) {
      sql = postgres(env.DATABASE_URL, {
        max: 1,
        idle_timeout: 0,
        connect_timeout: 10,
      });
      try {
        await sql.listen(WATCHDOG_CHANNEL, onNotification, () => {
          if (!readyNotified) {
            readyNotified = true;
            onReady?.();
            failedAttempts = 0;
          }
        });
        if (!ended) {
          await endConnection();
          await sleep(RECONNECT_DELAY_MS);
        }
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
