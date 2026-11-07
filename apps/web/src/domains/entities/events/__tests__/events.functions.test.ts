import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () =>
  (await import("@/testing/server-fn")).serverFnModuleDouble()
);
vi.mock("@/lib/orpc.server", async () =>
  (await import("@/testing/server-fn")).orpcServerModuleDouble()
);

import {
  createEventFn,
  deleteEventFn,
  listEventsPageFn,
  updateEventFn,
} from "@/domains/entities/events/events.functions";
import { callServerFn, orpc } from "@/testing/server-fn";
import { testId } from "@watchdog/test-kit";

const CASE_ID = testId(10);

beforeEach(() => orpc.reset());

describe("deleteEventFn", () => {
  it("sends only the Case and Event ids and answers nothing", async () => {
    orpc.reply("events.delete", { ok: true });

    await expect(
      callServerFn(deleteEventFn, { caseId: CASE_ID, eventId: testId(1) })
    ).resolves.toBeUndefined();

    expect(orpc.calls("events.delete")).toEqual([
      { caseId: CASE_ID, eventId: testId(1) },
    ]);
  });
});

describe("input validation", () => {
  it.each([
    ["listEventsPageFn", listEventsPageFn, { caseId: "not-a-uuid" }],
    ["createEventFn", createEventFn, { caseId: CASE_ID, entityId: "x" }],
    ["updateEventFn", updateEventFn, { caseId: CASE_ID, eventId: "x" }],
    ["deleteEventFn", deleteEventFn, { caseId: CASE_ID, eventId: "x" }],
  ] as const)(
    "%s refuses a malformed input before the API is called",
    async (_name, fn, input) => {
      await expect(callServerFn(fn, input)).rejects.toThrow();

      expect(orpc.calls("events.list")).toEqual([]);
      expect(orpc.calls("events.create")).toEqual([]);
      expect(orpc.calls("events.update")).toEqual([]);
      expect(orpc.calls("events.delete")).toEqual([]);
    }
  );

  it("trims padded ids on the list read", async () => {
    orpc.reply("events.list", { items: [], nextCursor: null, total: null });

    await callServerFn(listEventsPageFn, {
      caseId: `  ${CASE_ID}  `,
      entityId: testId(20),
    });

    expect(orpc.calls("events.list")).toMatchObject([
      { caseId: CASE_ID, entityId: testId(20) },
    ]);
  });
});
