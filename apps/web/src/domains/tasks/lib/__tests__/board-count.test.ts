import { describe, expect, it } from "vitest";

import { compactCountLabel } from "@/shared/lib/list/list-copy";
import { buildTaskListItem } from "@/testing/records";

import { taskBoardCount } from "../board-count.ts";

describe("taskBoardCount", () => {
  const cards = [buildTaskListItem(), buildTaskListItem()];

  it("is the cards held, and capped once the board was cut", () => {
    expect(
      compactCountLabel(taskBoardCount({ items: cards, isTruncated: false }))
    ).toBe("2");
    expect(
      compactCountLabel(taskBoardCount({ items: cards, isTruncated: true }))
    ).toBe("2+");
  });

  it("is empty while the board loads", () => {
    expect(taskBoardCount(undefined)).toMatchObject({
      loaded: 0,
      total: null,
      isSettled: false,
    });
  });
});
