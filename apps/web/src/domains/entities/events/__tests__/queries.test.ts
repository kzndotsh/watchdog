import { describe, expect, it, vi } from "vitest";

import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

vi.mock("@/domains/entities/events/events.functions", () => ({
  listEventsFn: vi.fn(),
}));

import { eventsKeys, eventsListQuery } from "@/domains/entities/events/queries";

describe("events queries", () => {
  it("builds case- and entity-scoped keys", () => {
    expect(eventsKeys.prefix("case-1")).toEqual(["events", "case-1"]);
    expect(eventsKeys.all("case-1", "ent-1")).toEqual([
      "events",
      "case-1",
      "ent-1",
    ]);
  });

  it("uses default stale and gc tiers for entity events", () => {
    expect(eventsListQuery("case-1", "ent-1")).toMatchObject({
      queryKey: eventsKeys.all("case-1", "ent-1"),
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    });
  });

  it("keeps placeholder data only for the same entity list key", () => {
    const entityOne = eventsListQuery("case-1", "ent-1");
    const entityTwo = eventsListQuery("case-1", "ent-2");
    const placeholderOne = entityOne.placeholderData;
    const placeholderTwo = entityTwo.placeholderData;
    expect(typeof placeholderOne).toBe("function");
    expect(typeof placeholderTwo).toBe("function");
    if (
      typeof placeholderOne !== "function" ||
      typeof placeholderTwo !== "function"
    ) {
      return;
    }

    const previousData = [{ id: "event-1" }] as never;
    const entityOneQuery = { queryKey: eventsKeys.all("case-1", "ent-1") };
    const entityTwoQuery = { queryKey: eventsKeys.all("case-1", "ent-2") };

    expect(placeholderOne(previousData, entityOneQuery as never)).toEqual(
      previousData
    );
    expect(
      placeholderOne(previousData, entityTwoQuery as never)
    ).toBeUndefined();
    expect(placeholderTwo(previousData, entityTwoQuery as never)).toEqual(
      previousData
    );
    expect(
      placeholderTwo(previousData, entityOneQuery as never)
    ).toBeUndefined();
  });
});
