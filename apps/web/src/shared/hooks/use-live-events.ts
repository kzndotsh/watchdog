import { useEffect, useEffectEvent } from "react";

import {
  isWatchdogEvent,
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

function openConnection(caseId: string): SharedConnection {
  const url = `/api/events?caseId=${encodeURIComponent(caseId)}`;
  const es = new EventSource(url);
  const handlers = new Set<EventHandler>();
  const listeners = WATCHDOG_EVENT_TYPES.map((type) => {
    const listener = createTypedEventListener(type, () => handlers);
    es.addEventListener(type, listener);
    return { type, listener };
  });
  const entry: SharedConnection = { es, handlers, refs: 0, listeners };
  connections.set(caseId, entry);
  return entry;
}

function closeConnection(caseId: string, entry: SharedConnection): void {
  for (const { type, listener } of entry.listeners) {
    entry.es.removeEventListener(type, listener);
  }
  entry.es.close();
  connections.delete(caseId);
}

function subscribeLiveEvents(
  caseId: string,
  handleEvent: EventHandler
): () => void {
  const entry = connections.get(caseId) ?? openConnection(caseId);
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

/**
 * Subscribe to live server events via SSE.
 *
 * Shares one EventSource per caseId across all mounted subscribers.
 *
 * @param caseId  Active case to filter events for. Pass null to skip.
 * @param onEvent Called for each WatchdogEvent received.
 */
export function useLiveEvents(
  caseId: string | null,
  onEvent: EventHandler
): void {
  const handleEvent = useEffectEvent(onEvent);

  useEffect(() => {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- consistent-return requires an explicit value alongside the cleanup-returning branch below
    if (!caseId || typeof EventSource === "undefined") return undefined;
    return subscribeLiveEvents(caseId, handleEvent);
  }, [caseId]);
}
