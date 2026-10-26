import type { Query, QueryClient } from "@tanstack/react-query";

/** One refetch walk per list view per window; an invalidation inside the window gets one trailing walk. */
export const LIST_REFETCH_THROTTLE_MS = 2000;

type Slot = {
  lastRunAt: number;
  /** The scheduled trailing refetch; every invalidation inside the window waits on it. */
  trailing: Promise<void> | null;
};

const slotsByClient = new WeakMap<QueryClient, Map<string, Slot>>();

function slotFor(client: QueryClient, hash: string): Slot {
  let slots = slotsByClient.get(client);
  if (slots === undefined) {
    slots = new Map();
    slotsByClient.set(client, slots);
  }
  let slot = slots.get(hash);
  if (slot === undefined) {
    slot = { lastRunAt: Number.NEGATIVE_INFINITY, trailing: null };
    slots.set(hash, slot);
  }
  return slot;
}

async function sleep(ms: number): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- wraps the timer the trailing refetch waits on
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** True for a query built by `listView` (`meta.isListView`). */
export function isListViewQuery(query: Query): boolean {
  return query.meta?.isListView === true;
}

/**
 * Run `refetch` for one list view (an infinite query, so a walk of up to `LIST_MAX_PAGES` pages)
 * at most once per `LIST_REFETCH_THROTTLE_MS`: the first invalidation runs at once, the ones
 * inside the window share one trailing run at its end. An ingest burst of N activity entries so
 * costs two walks per open view, not N. `softInvalidate` calls it after marking the view stale,
 * so a view that remounts meanwhile still refetches on mount. Resolves when the run that covers
 * this call has finished.
 */
export async function throttledListRefetch(
  client: QueryClient,
  query: Query,
  refetch: () => Promise<void>
): Promise<void> {
  const slot = slotFor(client, query.queryHash);
  if (slot.trailing !== null) {
    await slot.trailing;
    return;
  }
  const run = async (): Promise<void> => {
    slot.lastRunAt = Date.now();
    await refetch();
  };
  const wait = slot.lastRunAt + LIST_REFETCH_THROTTLE_MS - Date.now();
  if (wait <= 0) {
    await run();
    return;
  }
  const trailing = (async () => {
    await sleep(wait);
    slot.trailing = null;
    await run();
  })();
  slot.trailing = trailing;
  await trailing;
}
