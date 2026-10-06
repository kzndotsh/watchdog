import type { ActivityCursor } from "@watchdog/schemas/feed";

import { ACTIVITY_CHANNEL, listenOnChannel } from "./events";
import type { DbExec } from "./exec";
import { activityLogRepo, type ActivityRow } from "./repos/activity-log.repo";

const DEFAULT_BATCH = 500;
const DEFAULT_POLL_MS = 5000;
const DEFAULT_REPOLL_MS = 250;
const DEFAULT_HOLD_BACK_WARN_MS = 5000;

type Listen = (
  onNotification: (payload: string) => void,
  onReady: () => void,
  onError: (error: unknown) => void
) => { end: () => Promise<void> };

export interface ActivityTailerOptions {
  /** The pool handle the drain queries run on (never a transaction). */
  exec: DbExec;
  /** LISTEN seam; the default listens on `watchdog_activity` over a dedicated connection. */
  listen?: Listen;
  /** Rows per drain. A drain that fills the batch runs again at once. */
  batchSize?: number;
  /** Fallback poll: covers a dropped LISTEN and the reconnect window. */
  pollMs?: number;
  /** Re-poll interval while an open transaction holds rows back. */
  repollMs?: number;
  /** Call once per stall when rows stay held back this long (an open transaction). */
  holdBackWarnMs?: number;
  onHeldBack?: (heldMs: number) => void;
  /** A failed drain or LISTEN; the tailer keeps polling. */
  onError?: (error: unknown) => void;
}

export interface ActivityTailSubscription {
  /**
   * Settles once the tailer's cursor is initialised: every entry that becomes
   * safe after this point reaches the listener. A caller that replays history
   * must wait for it first, or entries between its replay snapshot and the
   * cursor's start could be missed. Rejects when the head read fails.
   */
  ready: Promise<void>;
  unsubscribe: () => void;
}

export interface ActivityTailer {
  /**
   * Receive every commit-safe entry after the tailer's cursor, in
   * `(xid, id)` order. The first subscriber starts the single LISTEN
   * connection; the last one to leave ends it.
   */
  subscribe: (listener: (row: ActivityRow) => void) => ActivityTailSubscription;
  /** Drop every subscriber and end the LISTEN connection. */
  stop: () => Promise<void>;
}

function defaultListen(
  onNotification: (payload: string) => void,
  onReady: () => void,
  onError: (error: unknown) => void
) {
  return listenOnChannel(ACTIVITY_CHANNEL, onNotification, onReady, onError);
}

/**
 * One tailer per process (ADR-0005 decision 4). It holds one LISTEN connection
 * and reads `(xid, id) > cursor AND xid < pg_snapshot_xmin(pg_current_snapshot())`
 * on a wake-up or a fallback poll, so a row is delivered only once every
 * transaction older than it has finished: a lower id that commits late can no
 * longer be skipped. Delivery order is xid order, which can differ from commit
 * order for concurrent transactions.
 */
export function createActivityTailer(
  options: ActivityTailerOptions
): ActivityTailer {
  const batch = options.batchSize ?? DEFAULT_BATCH;
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const repollMs = options.repollMs ?? DEFAULT_REPOLL_MS;
  const holdBackWarnMs = options.holdBackWarnMs ?? DEFAULT_HOLD_BACK_WARN_MS;
  const listen = options.listen ?? defaultListen;
  const listeners = new Set<(row: ActivityRow) => void>();

  let running = false;
  let generation = 0;
  let cursor: ActivityCursor | null = null;
  let draining = false;
  let rerun = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let connection: { end: () => Promise<void> } | undefined;
  let heldSince: number | null = null;
  let heldWarned = false;
  let ready: Promise<void> = Promise.resolve();

  function reportError(error: unknown): void {
    options.onError?.(error);
  }

  function emit(row: ActivityRow): void {
    for (const listener of listeners) {
      try {
        listener(row);
      } catch (error) {
        reportError(error);
      }
    }
  }

  function trackHoldBack(pending: boolean): void {
    if (!pending) {
      heldSince = null;
      heldWarned = false;
      return;
    }
    const now = Date.now();
    heldSince ??= now;
    if (!heldWarned && now - heldSince >= holdBackWarnMs) {
      heldWarned = true;
      options.onHeldBack?.(now - heldSince);
    }
  }

  /** True while the run that started a drain is still the current one. */
  function isCurrent(run: number): boolean {
    return running && run === generation;
  }

  function schedule(ms: number): void {
    if (timer !== undefined) clearTimeout(timer);
    if (!running) return;
    timer = setTimeout(() => {
      // oxlint-disable-next-line eslint/no-use-before-define -- schedule and drain call each other
      void drain();
    }, ms);
    timer.unref();
  }

  /** Returns whether rows past the cursor are still held back. */
  async function drainOnce(
    from: ActivityCursor,
    mine: number
  ): Promise<boolean> {
    let position = from;
    while (isCurrent(mine)) {
      // Sequential by design: each page starts where the last one ended.
      // oxlint-disable-next-line eslint/no-await-in-loop
      const rows = await activityLogRepo.drain(options.exec, {
        after: position,
        limit: batch,
      });
      for (const row of rows) {
        if (!isCurrent(mine)) return false;
        position = { xid: row.xid, id: row.id };
        cursor = position;
        emit(row);
      }
      if (rows.length < batch) break;
    }
    return activityLogRepo.hasPast(options.exec, position);
  }

  async function drain(): Promise<void> {
    if (!running) return;
    if (draining) {
      rerun = true;
      return;
    }
    draining = true;
    const mine = generation;
    let pending = false;
    try {
      do {
        rerun = false;
        if (cursor === null) break;
        // oxlint-disable-next-line eslint/no-await-in-loop
        pending = await drainOnce(cursor, mine);
      } while (rerun && isCurrent(mine));
      trackHoldBack(pending);
    } catch (error) {
      reportError(error);
    } finally {
      draining = false;
    }
    if (!running || cursor === null) return;
    if (mine === generation) {
      schedule(pending ? repollMs : pollMs);
    } else {
      // Stopped and restarted while this drain ran: the new run owns the cursor.
      void drain();
    }
  }

  function wake(): void {
    void drain();
  }

  function start(): void {
    running = true;
    generation += 1;
    cursor = null;
    const mine = generation;
    connection = listen(wake, wake, reportError);
    // The cursor starts at the head; the first drain then also catches whatever
    // committed while LISTEN was connecting.
    ready = activityLogRepo.head(options.exec).then((head) => {
      if (mine !== generation) return;
      cursor = head;
      void drain();
    });
    ready.catch(reportError);
  }

  async function halt(): Promise<void> {
    running = false;
    generation += 1;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    heldSince = null;
    heldWarned = false;
    const current = connection;
    connection = undefined;
    if (current !== undefined) await current.end().catch(() => {});
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      if (!running) start();
      return {
        ready,
        unsubscribe: () => {
          listeners.delete(listener);
          if (listeners.size === 0 && running) void halt();
        },
      };
    },
    async stop() {
      listeners.clear();
      await halt();
    },
  };
}
