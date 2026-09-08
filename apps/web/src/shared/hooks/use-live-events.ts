import { useEffect, useEffectEvent } from "react";

import {
  isWatchdogEvent,
  normalizeSseCaseId,
  WATCHDOG_EVENT_TYPES,
  type WatchdogEvent,
} from "@watchdog/schemas";

type EventHandler = (event: WatchdogEvent) => void;

interface SharedConnection {
  es: EventSource;
  handlers: Set<EventHandler>;
  refs: number;
  listeners: {
    type: WatchdogEvent["type"];
    listener: (event: Event) => void;
  }[];
}

const connections = new Map<string, SharedConnection>();

function parseWatchdogEvent(
  raw: Event,
  type: WatchdogEvent["type"]
): WatchdogEvent | null {
  if (!(raw instanceof MessageEvent) || typeof raw.data !== "string") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw.data);
    const candidate =
      typeof parsed === "object" && parsed !== null
        ? { ...parsed, type }
        : { type };
    return isWatchdogEvent(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function createTypedEventListener(
  type: WatchdogEvent["type"],
  fanOut: () => Iterable<EventHandler>
): (event: Event) => void {
  return (event: Event) => {
    const parsed = parseWatchdogEvent(event, type);
    if (!parsed) return;
    for (const handler of fanOut()) {
      handler(parsed);
    }
  };
}

function teardownTransport(entry: SharedConnection): void {
  for (const { type, listener } of entry.listeners) {
    entry.es.removeEventListener(type, listener);
  }
  entry.es.close();
}

function isConnectionLive(entry: SharedConnection): boolean {
  return entry.es.readyState !== EventSource.CLOSED;
}

function wireConnection(
  caseId: string,
  handlers: Set<EventHandler>,
  refs: number
): SharedConnection {
  const url = `/api/events?caseId=${encodeURIComponent(caseId)}`;
  const es = new EventSource(url);
  const listeners = WATCHDOG_EVENT_TYPES.map((type) => {
    const listener = createTypedEventListener(type, () => handlers);
    es.addEventListener(type, listener);
    return { type, listener };
  });
  const entry: SharedConnection = { es, handlers, refs, listeners };

  es.addEventListener("error", () => {
    if (es.readyState !== EventSource.CLOSED) return;
    if (connections.get(caseId) !== entry) return;
    if (entry.handlers.size === 0 || entry.refs <= 0) {
      teardownTransport(entry);
      connections.delete(caseId);
      return;
    }
    teardownTransport(entry);
    connections.delete(caseId);
    const replacement = wireConnection(caseId, entry.handlers, entry.refs);
    connections.set(caseId, replacement);
  });

  return entry;
}

function getOrOpenConnection(caseId: string): SharedConnection {
  const existing = connections.get(caseId);
  if (existing && isConnectionLive(existing)) {
    return existing;
  }
  const handlers = existing?.handlers ?? new Set<EventHandler>();
  const refs = existing?.refs ?? 0;
  if (existing) {
    teardownTransport(existing);
    connections.delete(caseId);
  }
  const entry = wireConnection(caseId, handlers, refs);
  connections.set(caseId, entry);
  return entry;
}

function closeConnection(caseId: string, entry: SharedConnection): void {
  teardownTransport(entry);
  connections.delete(caseId);
}

function subscribeLiveEvents(
  caseId: string,
  handleEvent: EventHandler
): () => void {
  const entry = getOrOpenConnection(caseId);
  entry.handlers.add(handleEvent);
  entry.refs += 1;

  return () => {
    entry.handlers.delete(handleEvent);
    entry.refs -= 1;
    if (entry.refs <= 0) {
      closeConnection(caseId, entry);
    }
  };
}

function normalizeLiveEventsCaseId(caseId: string): string | undefined {
  return normalizeSseCaseId(caseId);
}

function liveEventsSubscriptionKey(
  caseId: string | readonly string[] | null
): string {
  if (caseId === null) return "";
  if (typeof caseId === "string") {
    return normalizeLiveEventsCaseId(caseId) ?? "";
  }
  if (caseId.length === 0) return "";
  const normalized = caseId
    .map((id) => normalizeLiveEventsCaseId(id))
    .filter((id): id is string => id !== undefined)
    .sort();
  return normalized.join("\0");
}

/**
 * Subscribe to live server events via SSE.
 *
 * Shares one EventSource per caseId across all mounted subscribers.
 * Reopens the transport when the browser closes the EventSource permanently.
 *
 * @param caseId  Active case(s) to filter events for. Pass null to skip.
 * @param onEvent Called for each WatchdogEvent received.
 */
export function useLiveEvents(
  caseId: string | readonly string[] | null,
  onEvent: EventHandler
): void {
  const handleEvent = useEffectEvent(onEvent);
  const subscriptionKey = liveEventsSubscriptionKey(caseId);

  useEffect(() => {
    let teardown: (() => void) | undefined;
    if (subscriptionKey && typeof EventSource !== "undefined") {
      const caseIds = subscriptionKey.includes("\0")
        ? subscriptionKey.split("\0")
        : [subscriptionKey];
      const unsubs = caseIds.map((id) => subscribeLiveEvents(id, handleEvent));
      teardown = () => {
        for (const unsub of unsubs) unsub();
      };
    }
    return teardown;
  }, [subscriptionKey]);
}
