import type { Query, QueryClient } from "@tanstack/react-query";

/** One refetch walk per list view per window; an invalidation inside the window gets one trailing walk. */
export const LIST_REFETCH_THROTTLE_MS = 2000;

type Slot = {
  /** When the last walk started. */
  lastRunAt: number;
  /** The walk running now: never two at once for one view. */
  inFlight: Promise<void> | null;
  /** The one walk queued behind it; every invalidation until it starts waits on it. */
  trailing: Promise<void> | null;
};

const slotsByClient = new WeakMap<QueryClient, Map<string, Slot>>();

function slotsOf(client: QueryClient): Map<string, Slot> {
  let slots = slotsByClient.get(client);
  if (slots === undefined) {
    slots = new Map();
    slotsByClient.set(client, slots);
  }
  return slots;
}

async function sleep(ms: number): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- wraps the timer the trailing refetch waits on
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function settled(promise: Promise<void> | null): Promise<void> {
  try {
    await promise;
  } catch {
    // The caller of that walk sees its failure; the next walk runs regardless.
  }
}

/** True for a query built by `listView` (`meta.isListView`). */
export function isListViewQuery(query: Query): boolean {
  return query.meta?.isListView === true;
}

/** Views with throttle state for `client` (tests: an idle view leaves none behind). */
export function listRefetchSlotCount(client: QueryClient): number {
  return slotsOf(client).size;
}

/**
 * Run `refetch` for one list view (an infinite query, so a walk of up to `LIST_MAX_PAGES` pages)
 * at most once per `LIST_REFETCH_THROTTLE_MS` and never two walks at once: the first
 * invalidation runs at once; every invalidation while a walk runs or inside the window shares
 * one trailing walk, which starts after the running one settles and the window has passed. An
 * ingest burst of N activity entries so costs two walks per open view, not N. A view's state is
 * dropped once it has been idle for a window. Resolves when the walk that covers this call has
 * finished; `softInvalidate` calls it after marking the view stale, so a view that remounts
 * meanwhile still refetches on mount.
 */
export async function throttledListRefetch(
  client: QueryClient,
  query: Query,
  refetch: () => Promise<void>
): Promise<void> {
  const slots = slotsOf(client);
  const hash = query.queryHash;
  let slot = slots.get(hash);
  if (slot === undefined) {
    slot = {
      lastRunAt: Number.NEGATIVE_INFINITY,
      inFlight: null,
      trailing: null,
    };
    slots.set(hash, slot);
  }
  const view = slot;

  const forgetWhenIdle = () => {
    setTimeout(() => {
      const isIdle =
        view.inFlight === null &&
        view.trailing === null &&
        Date.now() - view.lastRunAt >= LIST_REFETCH_THROTTLE_MS;
      if (isIdle && slots.get(hash) === view) slots.delete(hash);
    }, LIST_REFETCH_THROTTLE_MS);
  };

  const run = async (): Promise<void> => {
    view.lastRunAt = Date.now();
    const walk = refetch();
    view.inFlight = walk;
    try {
      await walk;
    } finally {
      view.inFlight = null;
      forgetWhenIdle();
    }
  };

  if (view.trailing !== null) {
    await view.trailing;
    return;
  }
  const isWindowOpen = Date.now() - view.lastRunAt < LIST_REFETCH_THROTTLE_MS;
  if (view.inFlight === null && !isWindowOpen) {
    await run();
    return;
  }
  const trailing = (async () => {
    await settled(view.inFlight);
    const wait = view.lastRunAt + LIST_REFETCH_THROTTLE_MS - Date.now();
    if (wait > 0) await sleep(wait);
    view.trailing = null;
    await run();
  })();
  view.trailing = trailing;
  await trailing;
}
