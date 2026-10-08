import { describe, expect, it } from "vitest";

import { rendezvous } from "../rendezvous";

describe("rendezvous", () => {
  it("holds every party until the last one arrives", async () => {
    const arrive = rendezvous(3);
    const order: string[] = [];
    const first = arrive().then(() => order.push("first"));
    const second = arrive().then(() => order.push("second"));
    await Promise.resolve();
    expect(order).toEqual([]);
    const third = arrive().then(() => order.push("third"));
    await Promise.all([first, second, third]);
    expect(order).toHaveLength(3);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects the party count %s at creation",
    (parties) => {
      expect(() => rendezvous(parties)).toThrow(RangeError);
    }
  );
});
