import { Effect, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { readBoundedEffect } from "../read-bounded";

/** Chunks of `size` bytes, one per pull, counting how many were pulled. */
function counted(sizes: readonly number[]) {
  let pulled = 0;
  const stream = Stream.fromIterable(
    sizes.map((size) => new Uint8Array(size).fill(7)),
    { chunkSize: 1 }
  ).pipe(
    Stream.tap(() =>
      Effect.sync(() => {
        pulled += 1;
      })
    )
  );
  return { stream, pulled: () => pulled };
}

describe("readBoundedEffect", () => {
  it("joins the whole body when it fits, the limit itself included", async () => {
    const { stream } = counted([3, 4, 3]);
    const bytes = await Effect.runPromise(readBoundedEffect(stream, 10));
    expect(bytes).toEqual(new Uint8Array(10).fill(7));
  });

  it("is null past the limit, and pulls at most one chunk beyond it", async () => {
    const { stream, pulled } = counted([4, 4, 4, 4, 4]);
    expect(await Effect.runPromise(readBoundedEffect(stream, 6))).toBeNull();
    expect(pulled()).toBe(2);
  });

  it("reads text chunks as UTF-8 bytes", async () => {
    const bytes = await Effect.runPromise(
      readBoundedEffect(Stream.make("hé", "llo"), 100)
    );
    expect(new TextDecoder().decode(bytes ?? new Uint8Array())).toBe("héllo");
  });

  it("passes a source failure through as the stream's own error", async () => {
    const failure = await Effect.runPromise(
      Effect.flip(readBoundedEffect(Stream.fail("broken" as const), 10))
    );
    expect(failure).toBe("broken");
  });
});
