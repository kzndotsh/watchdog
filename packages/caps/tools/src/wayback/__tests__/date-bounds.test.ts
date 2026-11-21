import { describe, expect, it } from "vitest";

import { waybackBoundsOrdered, waybackBoundTimestamp } from "../date-bounds";

describe("waybackBoundTimestamp", () => {
  it("starts an `after` period at its first instant, at every precision", () => {
    expect(waybackBoundTimestamp("2019", "after")).toBe("20190101000000");
    expect(waybackBoundTimestamp("2019-06", "after")).toBe("20190601000000");
    expect(waybackBoundTimestamp("2019-06-15", "after")).toBe("20190615000000");
  });

  it("ends a `before` period at its last second, at every precision", () => {
    expect(waybackBoundTimestamp("2019", "before")).toBe("20191231235959");
    expect(waybackBoundTimestamp("2019-06", "before")).toBe("20190630235959");
    expect(waybackBoundTimestamp("2019-06-15", "before")).toBe(
      "20190615235959"
    );
  });

  it("ends a February `before` on its real last day", () => {
    expect(waybackBoundTimestamp("2023-02", "before")).toBe("20230228235959");
    expect(waybackBoundTimestamp("2024-02", "before")).toBe("20240229235959");
    expect(waybackBoundTimestamp("2024-02-29", "before")).toBe(
      "20240229235959"
    );
  });

  it("rejects text that is not a date at one of the three precisions", () => {
    for (const bad of [
      "",
      "abc",
      "19",
      "2019-6",
      "2019-13",
      "2019-00",
      "2019-02-30",
      "2023-02-29",
      "2019-06-31",
      "2019-06-00",
      "2019/06/15",
      "2019-06-15T10:00",
      "20190615",
      "1990",
    ]) {
      expect(waybackBoundTimestamp(bad, "after"), bad).toBeNull();
      expect(waybackBoundTimestamp(bad, "before"), bad).toBeNull();
    }
  });
});

describe("waybackBoundsOrdered", () => {
  it("accepts equal and ordered bounds, and an absent side", () => {
    expect(waybackBoundsOrdered("2019", "2019")).toBe(true);
    expect(waybackBoundsOrdered("2019-01", "2019-12-31")).toBe(true);
    expect(waybackBoundsOrdered("2019-06-15", "2019-06-15")).toBe(true);
    expect(waybackBoundsOrdered(undefined, "2019")).toBe(true);
    expect(waybackBoundsOrdered("2019", undefined)).toBe(true);
  });

  it("rejects `after` later than `before`", () => {
    expect(waybackBoundsOrdered("2020", "2019")).toBe(false);
    expect(waybackBoundsOrdered("2019-07", "2019-06")).toBe(false);
    expect(waybackBoundsOrdered("2019-06-16", "2019-06-15")).toBe(false);
  });
});
