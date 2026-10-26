import { describe, expect, it, vi } from "vitest";

import { testId } from "@watchdog/test-kit";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: () => ({
      handler: (fn: unknown) => fn,
    }),
    handler: (fn: unknown) => fn,
  }),
}));

const eventsApi = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock("@/lib/orpc.server", () => ({
  orpcFromContext: () => ({ events: eventsApi }),
}));

import {
  createEventFn,
  deleteEventFn,
  listEventsPageFn,
  updateEventFn,
} from "@/domains/entities/events/events.functions";

type ServerDataContext<T> = {
  data: T;
  context: Record<string, never>;
};

describe("events.functions", () => {
  it("lists and mutates entity events through oRPC", async () => {
    const event = {
      id: testId(1),
      entityId: testId(20),
      when: "2026-01-01",
      what: "Met",
      where: null,
    };
    eventsApi.list.mockResolvedValue({ items: [event], nextCursor: null });
    eventsApi.create.mockResolvedValue(event);
    eventsApi.update.mockResolvedValue(event);
    eventsApi.delete.mockResolvedValue(undefined);

    await (
      listEventsPageFn as unknown as (
        input: ServerDataContext<{ caseId: string; entityId: string }>
      ) => Promise<unknown[]>
    )({
      data: { caseId: testId(10), entityId: testId(20) },
      context: {},
    });
    await (
      createEventFn as unknown as (
        input: ServerDataContext<Record<string, unknown>>
      ) => Promise<unknown>
    )({
      data: {
        caseId: testId(10),
        entityId: testId(20),
        when: "2026-01-01",
        what: "Met",
      },
      context: {},
    });
    await (
      updateEventFn as unknown as (
        input: ServerDataContext<Record<string, unknown>>
      ) => Promise<unknown>
    )({
      data: {
        caseId: testId(10),
        eventId: testId(1),
        when: "2026-01-02",
        what: "Follow-up",
      },
      context: {},
    });
    await (
      deleteEventFn as unknown as (
        input: ServerDataContext<{ caseId: string; eventId: string }>
      ) => Promise<void>
    )({
      data: { caseId: testId(10), eventId: testId(1) },
      context: {},
    });

    // A list page passes its view through whole: one Entity's rows are `entityId` set.
    expect(eventsApi.list).toHaveBeenCalledWith({
      caseId: testId(10),
      entityId: testId(20),
    });
    expect(eventsApi.create).toHaveBeenCalled();
    expect(eventsApi.update).toHaveBeenCalled();
    expect(eventsApi.delete).toHaveBeenCalled();
  });
});
