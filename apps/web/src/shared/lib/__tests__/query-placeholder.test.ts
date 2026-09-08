import { describe, expect, it } from "vitest";

import {
  anyQueryPlaceholderData,
  isQueryPlaceholderData,
  placeholderDataForQueryKey,
  placeholderDataForScope,
} from "@/shared/lib/query-placeholder";

describe("placeholderDataForScope", () => {
  it("keeps previous data only while the scope predicate matches", () => {
    const placeholder = placeholderDataForScope<{ rows: number[] }>(
      (previousQuery) => previousQuery?.queryKey[1] === "case-1"
    );

    const previousData = { rows: [1] };
    const matchingQuery = { queryKey: ["items", "case-1"] };
    const otherQuery = { queryKey: ["items", "case-2"] };

    expect(placeholder(previousData, matchingQuery as never)).toEqual(
      previousData
    );
    expect(placeholder(previousData, otherQuery as never)).toBeUndefined();
    expect(placeholder(previousData, undefined)).toBeUndefined();
  });
});

describe("placeholderDataForQueryKey", () => {
  it("keeps previous data only for the exact query key", () => {
    const queryKey = ["tasks", "case-1", { entityId: "ent-1" }];
    const placeholder = placeholderDataForQueryKey<{ rows: number[] }>(
      queryKey
    );

    const previousData = { rows: [1] };
    const matchingQuery = { queryKey };
    const otherFilters = {
      queryKey: ["tasks", "case-1", { entityId: "ent-2" }],
    };

    expect(placeholder(previousData, matchingQuery as never)).toEqual(
      previousData
    );
    expect(placeholder(previousData, otherFilters as never)).toBeUndefined();
  });

  it("treats filter objects with different key order as the same query key", () => {
    const queryKey = ["tasks", "case-1", { entityId: "ent-1", status: "open" }];
    const placeholder = placeholderDataForQueryKey<{ rows: number[] }>(
      queryKey
    );

    const previousData = { rows: [1] };
    const reorderedFilters = {
      queryKey: ["tasks", "case-1", { status: "open", entityId: "ent-1" }],
    };

    expect(placeholder(previousData, reorderedFilters as never)).toEqual(
      previousData
    );
  });
});

describe("isQueryPlaceholderData", () => {
  it("reads placeholder state from suspense-compatible query results", () => {
    expect(isQueryPlaceholderData({ isPlaceholderData: true })).toBe(true);
    expect(isQueryPlaceholderData({ isPlaceholderData: false })).toBe(false);
    expect(isQueryPlaceholderData({})).toBe(false);
  });
});

describe("anyQueryPlaceholderData", () => {
  it("returns true when any result is placeholder data", () => {
    expect(
      anyQueryPlaceholderData([
        { isPlaceholderData: false },
        { isPlaceholderData: true },
      ])
    ).toBe(true);
    expect(anyQueryPlaceholderData([{ isPlaceholderData: false }, {}])).toBe(
      false
    );
  });
});
