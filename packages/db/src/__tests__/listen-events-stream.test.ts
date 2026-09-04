import { Effect, Stream } from "effect";
import { describe, expect, it, vi } from "vitest";

const listenMocks = vi.hoisted(() => {
  const end = vi.fn(async () => {});
  return {
    end,
    listenForEvents: vi.fn(
      (
        onNotification: (payload: string) => void,
        onReady?: () => void
      ): { end: () => Promise<void> } => {
        onReady?.();
        onNotification("payload-1");
        return { end };
      }
    ),
  };
});

vi.mock("../events", () => ({
  listenForEvents: listenMocks.listenForEvents,
}));

import { listenForEventsStream } from "../listen-events-stream";

describe("listenForEventsStream", () => {
  it("emits LISTEN payloads then ends the connection on interrupt", async () => {
    const seen: string[] = [];
    await Effect.runPromise(
      Effect.scoped(
        Stream.take(listenForEventsStream({ onReady: () => {} }), 1).pipe(
          Stream.runForEach((payload) =>
            Effect.sync(() => {
              seen.push(payload);
            })
          )
        )
      )
    );
    expect(seen).toEqual(["payload-1"]);
    expect(listenMocks.listenForEvents).toHaveBeenCalledTimes(1);
    expect(listenMocks.end).toHaveBeenCalledTimes(1);
  });
});
