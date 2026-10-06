import { Effect, Queue, Stream } from "effect";

import { listenForEventsStream as dbListenForEventsStream } from "@watchdog/db";
import { legacyEventForActivityEntry } from "@watchdog/schemas/feed";

import { acquireActivityTailer } from "../activity/tailer";
import { Db } from "./db-service";

/**
 * Raw `WatchdogEvent` payloads for a process that still speaks the legacy
 * shape (the worker's export listener). Core owns this entry so the worker,
 * which has no `@watchdog/db` dependency, reaches Postgres LISTEN through core.
 *
 * Two sources merge into one stream (ADR-0005 migration phase 1, the adapter):
 * the legacy `watchdog_events` channel, still fired by domains that have not
 * moved onto the log, and the activity tailer, whose entries are mapped to
 * their legacy event (`legacyEventForActivityEntry`). The tailer lives as long
 * as the stream and ends its LISTEN connection with it. Delivery from the
 * tailer waits for commit and is gap-free, but it starts at the head: events
 * from before this process started are not replayed to the legacy shape (the
 * durable worker cursor lands in a later slice).
 */
export function listenForEventsStream(
  ...args: Parameters<typeof dbListenForEventsStream>
): Stream.Stream<string, never, Db> {
  const adapted = Stream.unwrap(
    Effect.map(Effect.service(Db), (exec) =>
      Stream.callback<string>((queue) =>
        Effect.gen(function* adaptedActivityGen() {
          const tailer = yield* acquireActivityTailer(exec);
          const unsubscribe = yield* tailer.subscribe((entry) => {
            const event = legacyEventForActivityEntry(entry);
            if (event !== null) Queue.offerUnsafe(queue, JSON.stringify(event));
          });
          yield* Effect.addFinalizer(() => Effect.sync(unsubscribe));
        }).pipe(
          // A tailer that cannot start leaves the legacy channel running.
          Effect.catchTag("InternalError", () => Effect.void)
        )
      )
    )
  );
  return Stream.merge(dbListenForEventsStream(...args), adapted);
}
