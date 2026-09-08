import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

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

  failPermanently() {
    this.close();
    for (const listener of this.listeners.get("error") ?? []) {
      listener(new Event("error"));
    }
  }
}

vi.stubGlobal("EventSource", EventSourceMock);

import { useLiveEvents } from "@/shared/hooks/use-live-events";

describe("useLiveEvents", () => {
  it("does not connect when caseId is null", () => {
    EventSourceMock.instances = [];
    renderHook(() => {
      useLiveEvents(null, vi.fn());
    });
    expect(EventSourceMock.instances).toHaveLength(0);
  });

  it("subscribes to watchdog event types for the active case", () => {
    EventSourceMock.instances = [];
    const onEvent = vi.fn();
    const caseId = testId(10);

    renderHook(() => {
      useLiveEvents(caseId, onEvent);
    });

    const source = EventSourceMock.instances[0];
    expect(source?.url).toBe(
      `/api/events?caseId=${encodeURIComponent(caseId)}`
    );

    source?.emit(
      "job_update",
      JSON.stringify({ caseId, jobId: testId(11), status: "queued" })
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ caseId, type: "job_update", status: "queued" })
    );
  });

  it("trims padded caseId in the SSE URL", () => {
    EventSourceMock.instances = [];
    const caseId = testId(10);

    renderHook(() => {
      useLiveEvents(`  ${caseId}  `, vi.fn());
    });

    expect(EventSourceMock.instances[0]?.url).toBe(
      `/api/events?caseId=${encodeURIComponent(caseId)}`
    );
  });

  it("does not connect when caseId is not a valid uuid", () => {
    EventSourceMock.instances = [];
    renderHook(() => {
      useLiveEvents("not-a-uuid", vi.fn());
    });
    expect(EventSourceMock.instances).toHaveLength(0);
  });

  it("delivers proposal_queue_changed events", () => {
    EventSourceMock.instances = [];
    const onEvent = vi.fn();
    const caseId = testId(10);

    renderHook(() => {
      useLiveEvents(caseId, onEvent);
    });

    const source = EventSourceMock.instances[0];
    source?.emit(
      "proposal_queue_changed",
      JSON.stringify({ type: "proposal_queue_changed", caseId })
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "proposal_queue_changed", caseId })
    );
  });

  it("subscribes to every case when given an id list", () => {
    EventSourceMock.instances = [];
    const onEvent = vi.fn();
    const caseA = testId(10);
    const caseB = testId(11);

    renderHook(() => {
      useLiveEvents([caseB, caseA], onEvent);
    });

    expect(EventSourceMock.instances).toHaveLength(2);
    expect(
      EventSourceMock.instances.map((source) => source.url).sort()
    ).toEqual(
      [
        `/api/events?caseId=${encodeURIComponent(caseA)}`,
        `/api/events?caseId=${encodeURIComponent(caseB)}`,
      ].sort()
    );
  });

  it("reopens the EventSource after a permanent transport close", () => {
    EventSourceMock.instances = [];
    const onEvent = vi.fn();
    const caseId = testId(10);

    renderHook(() => {
      useLiveEvents(caseId, onEvent);
    });

    const first = EventSourceMock.instances[0];
    expect(first).toBeDefined();
    first?.failPermanently();

    const second = EventSourceMock.instances[1];
    expect(second).toBeDefined();
    expect(second?.url).toBe(first?.url);

    second?.emit(
      "job_update",
      JSON.stringify({ caseId, jobId: testId(11), status: "running" })
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ caseId, type: "job_update", status: "running" })
    );
  });
});
