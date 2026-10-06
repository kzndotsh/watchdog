import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ActivityEntry } from "@watchdog/schemas/feed";
import { testCaseId } from "@watchdog/schemas/testing";

type Listener = (event: Event) => void;

class EventSourceMock {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  static instances: EventSourceMock[] = [];
  url: string;
  listeners = new Map<string, Set<Listener>>();
  readyState = EventSourceMock.OPEN;

  constructor(url: string) {
    this.url = url;
    EventSourceMock.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.readyState = EventSourceMock.CLOSED;
  }

  emit(type: string, data: string) {
    const event = new MessageEvent(type, { data });
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  /** The browser gave up (a 4xx on reconnect, say): the source is closed for good. */
  failPermanently() {
    this.close();
    for (const listener of this.listeners.get("error") ?? []) {
      listener(new Event("error"));
    }
  }

  /** A transient drop: the browser keeps the source and retries by itself. */
  dropTemporarily() {
    this.readyState = EventSourceMock.CONNECTING;
    for (const listener of this.listeners.get("error") ?? []) {
      listener(new Event("error"));
    }
  }
}

import { subscribeActivityStream } from "@/shared/lib/activity-stream";

function entry(id: number, overrides: Record<string, unknown> = {}) {
  return {
    cursor: `0:${id}`,
    id,
    caseId: testCaseId(10),
    kind: "task",
    action: "created",
    subjectId: null,
    groupId: null,
    label: null,
    actorId: null,
    actorLabel: null,
    fromValue: null,
    toValue: null,
    at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function handlers() {
  return {
    onEntry: vi.fn<(entry: ActivityEntry) => void>(),
    onResync: vi.fn<() => void>(),
  };
}

function flushDeferredClose(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("activity stream", () => {
  beforeEach(async () => {
    vi.stubGlobal("EventSource", EventSourceMock);
    EventSourceMock.instances = [];
    await flushDeferredClose();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    await flushDeferredClose();
  });

  it("opens one organization-wide EventSource, with no Case id", () => {
    const unsubscribe = subscribeActivityStream(handlers());
    expect(EventSourceMock.instances).toHaveLength(1);
    expect(EventSourceMock.instances[0]?.url).toBe("/api/events");
    unsubscribe();
  });

  it("holds one connection however many subscribers (N Cases, M components)", () => {
    const unsubscribers = Array.from({ length: 12 }, () =>
      subscribeActivityStream(handlers())
    );
    expect(EventSourceMock.instances).toHaveLength(1);
    for (const unsubscribe of unsubscribers) unsubscribe();
  });

  it("listens for the single `activity` event and fans parsed entries out", () => {
    const a = handlers();
    const b = handlers();
    const offA = subscribeActivityStream(a);
    const offB = subscribeActivityStream(b);
    const source = EventSourceMock.instances[0];
    expect([...(source?.listeners.keys() ?? [])].sort()).toEqual([
      "activity",
      "error",
      "resync",
    ]);

    source?.emit("activity", JSON.stringify(entry(1)));

    expect(a.onEntry).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, kind: "task", cursor: "0:1" })
    );
    expect(b.onEntry).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });

  it("ignores malformed payloads and unknown kinds", () => {
    const h = handlers();
    const off = subscribeActivityStream(h);
    const source = EventSourceMock.instances[0];
    source?.emit("activity", "not json");
    source?.emit("activity", JSON.stringify({ id: 1 }));
    source?.emit("activity", JSON.stringify(entry(2, { kind: "nonsense" })));
    expect(h.onEntry).not.toHaveBeenCalled();
    off();
  });

  it("drops entries at or below its last cursor (at-least-once delivery)", () => {
    const h = handlers();
    const off = subscribeActivityStream(h);
    const source = EventSourceMock.instances[0];
    source?.emit("activity", JSON.stringify(entry(5)));
    source?.emit("activity", JSON.stringify(entry(5)));
    source?.emit("activity", JSON.stringify(entry(4)));
    source?.emit("activity", JSON.stringify(entry(6)));
    expect(h.onEntry.mock.calls.map(([e]) => e.id)).toEqual([5, 6]);
    off();
  });

  it("orders cursors by xid before id, numerically", () => {
    const h = handlers();
    const off = subscribeActivityStream(h);
    const source = EventSourceMock.instances[0];
    source?.emit("activity", JSON.stringify(entry(9, { cursor: "9:9" })));
    source?.emit("activity", JSON.stringify(entry(1, { cursor: "10:1" })));
    source?.emit("activity", JSON.stringify(entry(2, { cursor: "9:10" })));
    expect(h.onEntry.mock.calls.map(([e]) => e.cursor)).toEqual([
      "9:9",
      "10:1",
    ]);
    off();
  });

  it("hands a resync to every subscriber", () => {
    const a = handlers();
    const b = handlers();
    const offA = subscribeActivityStream(a);
    const offB = subscribeActivityStream(b);
    EventSourceMock.instances[0]?.emit("resync", "{}");
    expect(a.onResync).toHaveBeenCalledTimes(1);
    expect(b.onResync).toHaveBeenCalledTimes(1);
    offA();
    offB();
  });

  it("lets the browser reconnect by itself after a transient drop", () => {
    const off = subscribeActivityStream(handlers());
    EventSourceMock.instances[0]?.dropTemporarily();
    expect(EventSourceMock.instances).toHaveLength(1);
    off();
  });

  it("reopens after a permanent close, resuming from its last cursor", () => {
    vi.useFakeTimers();
    const h = handlers();
    const off = subscribeActivityStream(h);
    const first = EventSourceMock.instances[0];
    first?.emit("activity", JSON.stringify(entry(7)));
    first?.failPermanently();
    expect(EventSourceMock.instances).toHaveLength(1);

    vi.advanceTimersByTime(1000);

    const second = EventSourceMock.instances[1];
    expect(second?.url).toBe(`/api/events?after=${encodeURIComponent("0:7")}`);
    second?.emit("activity", JSON.stringify(entry(8)));
    expect(h.onEntry.mock.calls.map(([e]) => e.id)).toEqual([7, 8]);
    off();
    vi.advanceTimersByTime(0);
  });

  it("backs off between reopen attempts and caps the delay", () => {
    vi.useFakeTimers();
    const off = subscribeActivityStream(handlers());
    const delays: number[] = [];
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const before = EventSourceMock.instances.length;
      EventSourceMock.instances.at(-1)?.failPermanently();
      let waited = 0;
      while (EventSourceMock.instances.length === before) {
        vi.advanceTimersByTime(250);
        waited += 250;
      }
      delays.push(waited);
    }
    expect(delays[0]).toBe(1000);
    expect(delays[1]).toBeGreaterThan(delays[0] ?? 0);
    expect(Math.max(...delays)).toBeLessThanOrEqual(30_000);
    off();
    vi.advanceTimersByTime(0);
  });

  it("closes the connection after the last subscriber leaves, and not before", async () => {
    const off1 = subscribeActivityStream(handlers());
    const off2 = subscribeActivityStream(handlers());
    off1();
    await flushDeferredClose();
    expect(EventSourceMock.instances[0]?.readyState).toBe(EventSourceMock.OPEN);
    off2();
    await flushDeferredClose();
    expect(EventSourceMock.instances[0]?.readyState).toBe(
      EventSourceMock.CLOSED
    );
  });

  it("reuses the stream when a subscriber remounts in the same tick", async () => {
    const first = subscribeActivityStream(handlers());
    first();
    const off = subscribeActivityStream(handlers());
    await flushDeferredClose();
    expect(EventSourceMock.instances).toHaveLength(1);
    expect(EventSourceMock.instances[0]?.readyState).toBe(EventSourceMock.OPEN);
    off();
  });

  it("does not reopen after everyone has left", async () => {
    vi.useFakeTimers();
    const off = subscribeActivityStream(handlers());
    const source = EventSourceMock.instances[0];
    off();
    await vi.advanceTimersByTimeAsync(0);
    source?.failPermanently();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(EventSourceMock.instances).toHaveLength(1);
  });

  it("does nothing without EventSource (server render)", () => {
    vi.stubGlobal("EventSource", undefined);
    const off = subscribeActivityStream(handlers());
    expect(EventSourceMock.instances).toHaveLength(0);
    off();
  });
});
