import { listenForEvents as dbListenForEvents } from "@watchdog/db";

/**
 * Callback LISTEN for the SSE route. Core owns this entry so apps/web, which must not
 * import `@watchdog/db`, reaches Postgres LISTEN through core.
 *
 * There is no notify helper here any more: every domain appends to the activity log
 * and the `activity_notify` trigger sends the NOTIFY at commit (ADR-0005).
 */
export function listenForEvents(
  ...args: Parameters<typeof dbListenForEvents>
): ReturnType<typeof dbListenForEvents> {
  return dbListenForEvents(...args);
}
