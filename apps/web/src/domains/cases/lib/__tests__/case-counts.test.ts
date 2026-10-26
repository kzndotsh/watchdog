import { describe, expect, it } from "vitest";

import { localDayStartIso, tileCount } from "../case-counts.ts";

describe("tileCount", () => {
  it("shows an exact count as a number and a capped one as N+", () => {
    expect(tileCount({ count: 12, isCapped: false })).toBe(12);
    expect(tileCount({ count: 0, isCapped: false })).toBe(0);
    expect(tileCount({ count: 1000, isCapped: true })).toBe("1000+");
  });
});

describe("localDayStartIso", () => {
  it("is local midnight of the given instant", () => {
    const now = new Date(2026, 2, 10, 17, 45, 12);
    const start = new Date(localDayStartIso(now));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(2);
    expect(start.getDate()).toBe(10);
    expect([
      start.getHours(),
      start.getMinutes(),
      start.getSeconds(),
      start.getMilliseconds(),
    ]).toEqual([0, 0, 0, 0]);
  });
});
