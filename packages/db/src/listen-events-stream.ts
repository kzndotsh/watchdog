import { Effect, Queue, Stream } from "effect";

import { listenForEvents } from "./events";

export interface ListenForEventsStreamOpts {
  readonly onReady?: () => void;
  readonly onError?: (error: unknown) => void;
}

/** Web SSE still uses callback `listenForEvents`. */
export function listenForEventsStream(
  opts: ListenForEventsStreamOpts = {}
): Stream.Stream<string> {
  return Stream.callback<string>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        listenForEvents(
          (payload) => {
            Queue.offerUnsafe(queue, payload);
          },
          opts.onReady,
          opts.onError
        )
      ),
      (listener) =>
        Effect.tryPromise({
          try: () => listener.end(),
          catch: (error) =>
            new Error(error instanceof Error ? error.message : String(error)),
        }).pipe(Effect.catch(() => Effect.void))
    )
  );
}
