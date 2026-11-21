import { describe, expect, it } from "vitest";

import { mergeColumnOrder } from "../task-order";

describe("mergeColumnOrder", () => {
  it("is the sent order when the whole column is sent", () => {
    expect(mergeColumnOrder(["a", "b", "c"], ["c", "a", "b"])).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("moves only the sent Tasks, inside the slots they hold", () => {
    // The board shows a and c (filtered by Entity); b and d are someone else's.
    expect(mergeColumnOrder(["a", "b", "c", "d"], ["c", "a"])).toEqual([
      "c",
      "b",
      "a",
      "d",
    ]);
  });

  it("refuses an id outside the column (a stale view)", () => {
    expect(mergeColumnOrder(["a", "b"], ["a", "x"])).toBeNull();
  });

  it("refuses an id sent twice", () => {
    expect(mergeColumnOrder(["a", "b"], ["a", "a"])).toBeNull();
  });
});
