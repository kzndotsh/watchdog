import { describe, expect, it } from "vitest";

import { nextQueueIndex, queueStepForKey } from "@/shared/lib/queue-keyboard";

const bare = { metaKey: false, ctrlKey: false, altKey: false, target: null };

describe("nextQueueIndex", () => {
  it("starts at the edge when nothing is selected", () => {
    expect(nextQueueIndex(3, -1, 1)).toBe(0);
    expect(nextQueueIndex(3, -1, -1)).toBe(2);
  });

  it("steps and stops at the ends", () => {
    expect(nextQueueIndex(3, 0, 1)).toBe(1);
    expect(nextQueueIndex(3, 2, 1)).toBeNull();
    expect(nextQueueIndex(3, 0, -1)).toBeNull();
    expect(nextQueueIndex(0, -1, 1)).toBeNull();
  });
});

describe("queueStepForKey", () => {
  it("maps j/k anywhere and arrows only inside the queue", () => {
    expect(queueStepForKey({ ...bare, key: "j" }, false)).toBe(1);
    expect(queueStepForKey({ ...bare, key: "k" }, false)).toBe(-1);
    expect(queueStepForKey({ ...bare, key: "ArrowDown" }, false)).toBeNull();
    expect(queueStepForKey({ ...bare, key: "ArrowDown" }, true)).toBe(1);
    expect(queueStepForKey({ ...bare, key: "ArrowUp" }, true)).toBe(-1);
  });

  it("ignores modified keys and editable targets", () => {
    expect(
      queueStepForKey({ ...bare, key: "j", metaKey: true }, true)
    ).toBeNull();
    expect(
      queueStepForKey({ ...bare, key: "j", target: { tagName: "INPUT" } }, true)
    ).toBeNull();
  });
});
