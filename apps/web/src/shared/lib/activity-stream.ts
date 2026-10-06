import {
  activityEntrySchema,
  compareActivityCursor,
  parseActivityCursor,
  type ActivityCursor,
  type ActivityEntry,
} from "@watchdog/schemas/feed";

/**
 * The one organization-wide activity stream (ADR-0005 decision 6): a single
 * `EventSource` on `/api/events` carries every entry of every Case the caller
 * can see, so a dashboard with N Cases holds one browser connection and the
 * server one LISTEN, however many components subscribe. A single `activity`
 * listener parses each entry once and fans it out; `resync` (the server could
 * not replay what this client missed) is fanned out as well.
 *
 * Resuming: while the browser keeps the source it reconnects by itself and
 * resends `Last-Event-ID`. When it gives up (the source is `CLOSED`) this
 * module reopens it after a backoff with `?after=<last cursor>`, so the server
 * replays the gap or answers `resync`. Delivery is at-least-once: entries at or
 * below the last cursor are dropped here.
 */

export interface ActivityStreamHandlers {
  onEntry: (entry: ActivityEntry) => void;
  /** Entries were missed beyond what the server can replay: refetch everything. */
  onResync?: () => void;
}

const EVENTS_URL = "/api/events";
const REOPEN_BASE_MS = 1000;
const REOPEN_MAX_MS = 30_000;

interface Connection {
  es: EventSource;
  listeners: { type: string; listener: (event: Event) => void }[];
}

interface StreamState {
  handlers: Set<ActivityStreamHandlers>;
  connection: Connection | null;
  /** Last cursor delivered; resume point for a reopen and the duplicate guard. */
  last: ActivityCursor | null;
  reopenTimer: ReturnType<typeof setTimeout> | null;
  reopenDelay: number;
}

const state: StreamState = {
  handlers: new Set(),
  connection: null,
  last: null,
  reopenTimer: null,
  reopenDelay: REOPEN_BASE_MS,
};

function parseEntry(raw: Event): ActivityEntry | null {
  if (!(raw instanceof MessageEvent) || typeof raw.data !== "string") {
    return null;
  }
  try {
    const parsed = activityEntrySchema.safeParse(JSON.parse(raw.data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function deliver(entry: ActivityEntry): void {
  const cursor = parseActivityCursor(entry.cursor);
  if (cursor === null) return;
  if (state.last !== null && compareActivityCursor(cursor, state.last) <= 0) {
    return;
  }
  state.last = cursor;
  for (const handler of state.handlers) handler.onEntry(entry);
}

function teardown(connection: Connection): void {
  for (const { type, listener } of connection.listeners) {
    connection.es.removeEventListener(type, listener);
  }
  connection.es.close();
}

function clearReopen(): void {
  if (state.reopenTimer !== null) {
    clearTimeout(state.reopenTimer);
    state.reopenTimer = null;
  }
}

function streamUrl(): string {
  return state.last === null
    ? EVENTS_URL
    : `${EVENTS_URL}?after=${encodeURIComponent(`${state.last.xid}:${state.last.id}`)}`;
}

function scheduleReopen(reopen: () => void): void {
  if (state.reopenTimer !== null) return;
  const delay = state.reopenDelay;
  state.reopenDelay = Math.min(delay * 2, REOPEN_MAX_MS);
  state.reopenTimer = setTimeout(() => {
    state.reopenTimer = null;
    if (state.handlers.size > 0 && state.connection === null) reopen();
  }, delay);
}

function open(): void {
  if (typeof EventSource === "undefined") return;
  const es = new EventSource(streamUrl());
  const listeners = [
    {
      type: "activity",
      listener: (event: Event) => {
        const entry = parseEntry(event);
        if (entry !== null) {
          state.reopenDelay = REOPEN_BASE_MS;
          deliver(entry);
        }
      },
    },
    {
      type: "resync",
      listener: () => {
        state.reopenDelay = REOPEN_BASE_MS;
        for (const handler of state.handlers) handler.onResync?.();
      },
    },
    {
      type: "error",
      listener: () => {
        // A transient drop keeps the source: the browser retries on its own.
        if (es.readyState !== EventSource.CLOSED) return;
        if (state.connection?.es !== es) return;
        teardown(state.connection);
        state.connection = null;
        if (state.handlers.size > 0) scheduleReopen(open);
      },
    },
  ];
  for (const { type, listener } of listeners) {
    es.addEventListener(type, listener);
  }
  state.connection = { es, listeners };
}

function closeIfUnused(): void {
  if (state.handlers.size > 0) return;
  clearReopen();
  if (state.connection !== null) {
    teardown(state.connection);
    state.connection = null;
  }
  state.last = null;
  state.reopenDelay = REOPEN_BASE_MS;
}

/**
 * Subscribe to the shared stream; the first subscriber opens it, the last one
 * closes it. Returns the unsubscribe function.
 */
export function subscribeActivityStream(
  handlers: ActivityStreamHandlers
): () => void {
  state.handlers.add(handlers);
  if (state.connection === null && state.reopenTimer === null) open();
  return () => {
    state.handlers.delete(handlers);
    if (state.handlers.size > 0) return;
    // Defer so a resubscribe in the same commit (dep change, StrictMode
    // remount, sibling mounting) reuses the stream instead of aborting it.
    setTimeout(closeIfUnused, 0);
  };
}
