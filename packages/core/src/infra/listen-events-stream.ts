import { listenForEventsStream as dbListenForEventsStream } from "@watchdog/db";

/**
 * Effect `Stream` of raw LISTEN payloads. Core owns this entry so the worker, which has
 * no `@watchdog/db` dependency, reaches Postgres LISTEN through core.
 */
export function listenForEventsStream(
  ...args: Parameters<typeof dbListenForEventsStream>
): ReturnType<typeof dbListenForEventsStream> {
  return dbListenForEventsStream(...args);
}
